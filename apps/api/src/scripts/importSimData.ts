import "dotenv/config"
import fs from "node:fs/promises"
import path from "node:path"
import bcrypt from "bcrypt"
import { Pool, type PoolClient } from "pg"

type SimEmployer = {
  id: string
  name: string
  category: string
  dong: string
  nearestHub: string
  location: {
    lat: number
    lng: number
  }
  persona: string
  avgRating: number
  reviewCount: number
}

type SimWorker = {
  id: string
  name: string
  persona: string
  location: {
    lat: number
    lng: number
  }
  categories: string[]
  avgRating: number
  ratingCount: number
  verified: boolean
  lastSeenAt: number
  available: boolean
}

type SimPosting = {
  id: string
  employerId: string
  employerName: string
  employerLocation: {
    lat: number
    lng: number
  }
  rawText: string
  draft: {
    title: string
    category: string
    hourlyRate: number
    headcount: number
    durationHours: number
    startAtIso: string
    address: string
    description: string
    tags: string[]
  }
}

type EmployersFile = {
  employers: SimEmployer[]
}

type WorkersFile = {
  workers: SimWorker[]
}

type PostingsFile = {
  postings: SimPosting[]
}

type UserRow = {
  id: string
}

const CATEGORY_LABELS: Record<string, string> = {
  cafe: "카페/음료",
  restaurant: "요식업",
  retail: "편의점",
  event: "행사/이벤트",
  delivery: "물류/배달",
  cleaning: "청소/미화",
  manufacturing: "기타",
  other: "기타",
}

const repoRoot = path.resolve(__dirname, "../../../..")
const dataDir = path.join(repoRoot, "sim", "data")
const defaultPassword = process.env.SIM_SEED_PASSWORD ?? "TestPass123!"
const isDryRun = process.argv.includes("--dry-run")

function requireDatabaseUrl() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required")
  }
}

function assertNotProductionImport() {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_SIM_IMPORT !== "true") {
    throw new Error("Refusing to import sim data in production without ALLOW_SIM_IMPORT=true")
  }
}

function mapCategory(category: string) {
  return CATEGORY_LABELS[category] ?? "기타"
}

function simEmployerEmail(employerId: string) {
  return `sim-employer-${employerId}@albaconnect.local`
}

function simWorkerEmail(workerId: string) {
  return `sim-worker-${workerId}@albaconnect.local`
}

function simPhone(prefix: string, id: string) {
  const numeric = id.replace(/\D/g, "").padStart(4, "0").slice(-4)
  return `010-${prefix}-${numeric}`
}

function parseJson<T>(raw: string, filePath: string): T {
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(`Invalid JSON in ${filePath}: ${message}`)
  }
}

async function readJson<T>(fileName: string): Promise<T> {
  const filePath = path.join(dataDir, fileName)
  const raw = await fs.readFile(filePath, "utf8")
  return parseJson<T>(raw, filePath)
}

function rollForwardStartAt(startAtIso: string, index: number) {
  const source = new Date(startAtIso)
  if (Number.isNaN(source.getTime())) {
    throw new Error(`Invalid posting startAtIso: ${startAtIso}`)
  }

  const now = new Date()
  const startAt = new Date(now)
  startAt.setDate(now.getDate() + 1 + (index % 14))
  startAt.setHours(source.getHours(), source.getMinutes(), 0, 0)

  if (startAt <= now) {
    startAt.setDate(startAt.getDate() + 1)
  }

  return startAt
}

function addHours(date: Date, hours: number) {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function buildDescription(posting: SimPosting) {
  const tags = posting.draft.tags.length > 0 ? `태그: ${posting.draft.tags.join(", ")}` : undefined
  return [
    posting.draft.description,
    "",
    `원문: ${posting.rawText}`,
    tags,
    `[sim:${posting.id}]`,
  ].filter((line): line is string => Boolean(line)).join("\n")
}

function postingAddress(posting: SimPosting) {
  const address = posting.draft.address?.trim()
  return address || `${posting.employerName} 근처`
}

async function upsertUser(
  client: PoolClient,
  input: {
    email: string
    passwordHash: string
    role: "employer" | "worker"
    name: string
    phone: string
  },
) {
  const result = await client.query<UserRow>(
    `
      INSERT INTO users (email, password_hash, role, name, phone)
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        role = EXCLUDED.role,
        name = EXCLUDED.name,
        phone = EXCLUDED.phone
      RETURNING id
    `,
    [input.email, input.passwordHash, input.role, input.name, input.phone],
  )

  return result.rows[0].id
}

async function upsertEmployerProfile(client: PoolClient, employer: SimEmployer, userId: string) {
  await client.query(
    `
      INSERT INTO employer_profiles (
        user_id, company_name, business_number, rating_avg, rating_count, is_suspended, plan_tier, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, false, 'premium', now())
      ON CONFLICT (user_id) DO UPDATE SET
        company_name = EXCLUDED.company_name,
        business_number = EXCLUDED.business_number,
        rating_avg = EXCLUDED.rating_avg,
        rating_count = EXCLUDED.rating_count,
        is_suspended = false,
        plan_tier = 'premium',
        updated_at = now()
    `,
    [userId, employer.name, `SIM-${employer.id}`, employer.avgRating.toFixed(2), employer.reviewCount],
  )
}

async function upsertWorkerProfile(client: PoolClient, worker: SimWorker, userId: string) {
  const lastSeenAt = Number.isFinite(worker.lastSeenAt) ? new Date(worker.lastSeenAt) : null
  await client.query(
    `
      INSERT INTO worker_profiles (
        user_id, categories, bio, rating_avg, rating_count, is_available, is_suspended,
        is_phone_verified, location, last_seen_at, updated_at
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, false, $7,
        ST_SetSRID(ST_MakePoint($8, $9), 4326), $10, now()
      )
      ON CONFLICT (user_id) DO UPDATE SET
        categories = EXCLUDED.categories,
        bio = EXCLUDED.bio,
        rating_avg = EXCLUDED.rating_avg,
        rating_count = EXCLUDED.rating_count,
        is_available = EXCLUDED.is_available,
        is_suspended = false,
        is_phone_verified = EXCLUDED.is_phone_verified,
        location = EXCLUDED.location,
        last_seen_at = EXCLUDED.last_seen_at,
        updated_at = now()
    `,
    [
      userId,
      worker.categories.map(mapCategory),
      worker.persona,
      worker.avgRating.toFixed(2),
      worker.ratingCount,
      worker.available,
      worker.verified,
      worker.location.lng,
      worker.location.lat,
      lastSeenAt,
    ],
  )
}

async function findSimPostingId(client: PoolClient, simId: string) {
  const marker = `[sim:${simId}]`
  const result = await client.query<UserRow>(
    "SELECT id FROM job_postings WHERE POSITION($1 IN description) > 0 LIMIT 1",
    [marker],
  )
  return result.rows[0]?.id
}

async function upsertJobPosting(
  client: PoolClient,
  posting: SimPosting,
  employerUserId: string,
  index: number,
) {
  const startAt = rollForwardStartAt(posting.draft.startAtIso, index)
  const endAt = addHours(startAt, posting.draft.durationHours)
  const headcount = posting.draft.headcount || 1
  const totalAmount = posting.draft.hourlyRate * posting.draft.durationHours * headcount
  const description = buildDescription(posting)
  const category = mapCategory(posting.draft.category)
  const address = postingAddress(posting)
  const existingId = await findSimPostingId(client, posting.id)

  if (existingId) {
    await client.query(
      `
        UPDATE job_postings SET
          employer_id = $1,
          title = $2,
          category = $3,
          start_at = $4,
          end_at = $5,
          hourly_rate = $6,
          total_amount = $7,
          headcount = $8,
          matched_count = 0,
          location = ST_SetSRID(ST_MakePoint($9, $10), 4326),
          address = $11,
          description = $12,
          status = 'open',
          escrow_status = 'pending',
          payment_status_job = 'pending',
          dispute_hold = false,
          location_lat = $10,
          location_lon = $9,
          location_enforcement = true,
          updated_at = now()
        WHERE id = $13
      `,
      [
        employerUserId,
        posting.draft.title,
        category,
        startAt,
        endAt,
        posting.draft.hourlyRate,
        totalAmount,
        headcount,
        posting.employerLocation.lng,
        posting.employerLocation.lat,
        address,
        description,
        existingId,
      ],
    )
    return "updated"
  }

  await client.query(
    `
      INSERT INTO job_postings (
        employer_id, title, category, start_at, end_at, hourly_rate, total_amount, headcount,
        matched_count, location, address, description, status, escrow_status, payment_status_job,
        dispute_hold, location_lat, location_lon, location_enforcement
      )
      VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, 0,
        ST_SetSRID(ST_MakePoint($9, $10), 4326),
        $11, $12, 'open', 'pending', 'pending', false, $10, $9, true
      )
    `,
    [
      employerUserId,
      posting.draft.title,
      category,
      startAt,
      endAt,
      posting.draft.hourlyRate,
      totalAmount,
      headcount,
      posting.employerLocation.lng,
      posting.employerLocation.lat,
      address,
      description,
    ],
  )
  return "inserted"
}

async function main() {
  requireDatabaseUrl()
  assertNotProductionImport()

  const [employersFile, workersFile, postingsFile] = await Promise.all([
    readJson<EmployersFile>("employers.json"),
    readJson<WorkersFile>("workers.json"),
    readJson<PostingsFile>("postings.json"),
  ])

  if (isDryRun) {
    console.log("Sim data import dry run")
    console.log(`employers=${employersFile.employers.length}`)
    console.log(`workers=${workersFile.workers.length}`)
    console.log(`postings=${postingsFile.postings.length}`)
    return
  }

  const passwordHash = await bcrypt.hash(defaultPassword, 12)
  const pool = new Pool({ connectionString: process.env.DATABASE_URL })
  const client = await pool.connect()
  const employerUserIds = new Map<string, string>()
  let insertedJobs = 0
  let updatedJobs = 0

  try {
    await client.query("BEGIN")

    for (const employer of employersFile.employers) {
      const userId = await upsertUser(client, {
        email: simEmployerEmail(employer.id),
        passwordHash,
        role: "employer",
        name: employer.name,
        phone: simPhone("7000", employer.id),
      })
      await upsertEmployerProfile(client, employer, userId)
      employerUserIds.set(employer.id, userId)
    }

    for (const worker of workersFile.workers) {
      const userId = await upsertUser(client, {
        email: simWorkerEmail(worker.id),
        passwordHash,
        role: "worker",
        name: worker.name,
        phone: simPhone("8000", worker.id),
      })
      await upsertWorkerProfile(client, worker, userId)
    }

    for (const [index, posting] of postingsFile.postings.entries()) {
      const employerUserId = employerUserIds.get(posting.employerId)
      if (!employerUserId) {
        throw new Error(`Posting ${posting.id} references unknown employer ${posting.employerId}`)
      }

      const result = await upsertJobPosting(client, posting, employerUserId, index)
      if (result === "inserted") insertedJobs += 1
      if (result === "updated") updatedJobs += 1
    }

    await client.query("COMMIT")

    console.log("Sim data import completed")
    console.log(`employers=${employersFile.employers.length}`)
    console.log(`workers=${workersFile.workers.length}`)
    console.log(`postings.inserted=${insertedJobs}`)
    console.log(`postings.updated=${updatedJobs}`)
    console.log("login.password=TestPass123! unless SIM_SEED_PASSWORD is set")
  } catch (error) {
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error))
  process.exitCode = 1
})
