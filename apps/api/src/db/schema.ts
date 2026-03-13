import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, pgEnum, customType, jsonb } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Custom PostGIS point type
const point = customType<{ data: { lat: number; lng: number }; driverData: string }>({
  dataType() {
    return "geometry(Point, 4326)"
  },
  toDriver(value) {
    return sql`ST_SetSRID(ST_MakePoint(${value.lng}, ${value.lat}), 4326)`
  },
  fromDriver(value: string) {
    // Parse WKB or GeoJSON from PostGIS
    if (typeof value === "string" && value.startsWith("{")) {
      const geo = JSON.parse(value)
      return { lat: geo.coordinates[1], lng: geo.coordinates[0] }
    }
    return { lat: 0, lng: 0 }
  },
})

export const userRoleEnum = pgEnum("user_role", ["employer", "worker"])
export const jobStatusEnum = pgEnum("job_status", ["draft", "open", "matched", "in_progress", "completed", "cancelled"])
export const paymentStatusEnum2 = pgEnum("payment_status_job", ["pending", "triggered", "completed", "failed"])
export const escrowStatusEnum = pgEnum("escrow_status", ["pending", "escrowed", "released", "refunded"])
export const applicationStatusEnum = pgEnum("application_status", ["offered", "accepted", "rejected", "timeout", "completed", "noshow"])
export const penaltyTypeEnum = pgEnum("penalty_type", ["worker_noshow", "employer_noshow", "employer_cancel_late"])
export const paymentStatusEnum = pgEnum("payment_status", ["pending", "completed", "failed", "refunded"])

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  role: userRoleEnum("role").notNull(),
  name: varchar("name", { length: 100 }).notNull(),
  phone: varchar("phone", { length: 20 }).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const employerProfiles = pgTable("employer_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  companyName: varchar("company_name", { length: 200 }).notNull(),
  businessNumber: varchar("business_number", { length: 20 }),
  ratingAvg: decimal("rating_avg", { precision: 3, scale: 2 }).default("0").notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const workerProfiles = pgTable("worker_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  categories: text("categories").array().default(sql`ARRAY[]::text[]`).notNull(),
  bio: text("bio"),
  ratingAvg: decimal("rating_avg", { precision: 3, scale: 2 }).default("0").notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  isAvailable: boolean("is_available").default(false).notNull(),
  location: point("location"),
  lastSeenAt: timestamp("last_seen_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Web Push subscription (nullable — set when worker grants notification permission)
  pushSubscription: jsonb("push_subscription"),
})

export const jobPostings = pgTable("job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  employerId: uuid("employer_id").references(() => users.id).notNull(),
  title: varchar("title", { length: 200 }).notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  startAt: timestamp("start_at").notNull(),
  endAt: timestamp("end_at").notNull(),
  hourlyRate: integer("hourly_rate").notNull(),
  totalAmount: integer("total_amount").notNull(),
  headcount: integer("headcount").default(1).notNull(),
  matchedCount: integer("matched_count").default(0).notNull(),
  location: point("location").notNull(),
  address: varchar("address", { length: 500 }).notNull(),
  description: text("description").notNull(),
  status: jobStatusEnum("status").default("open").notNull(),
  escrowStatus: escrowStatusEnum("escrow_status").default("pending").notNull(),
  paymentStatus: paymentStatusEnum2("payment_status_job").default("pending").notNull(),
  statusUpdatedAt: timestamp("status_updated_at"),
  completedAt: timestamp("completed_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const jobApplications = pgTable("job_applications", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobPostings.id).notNull(),
  workerId: uuid("worker_id").references(() => users.id).notNull(),
  status: applicationStatusEnum("status").default("offered").notNull(),
  offeredAt: timestamp("offered_at").defaultNow().notNull(),
  respondedAt: timestamp("responded_at"),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const payments = pgTable("payments", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobPostings.id).notNull(),
  payerId: uuid("payer_id").references(() => users.id).notNull(),
  amount: integer("amount").notNull(),
  platformFee: integer("platform_fee").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  tossPaymentKey: varchar("toss_payment_key", { length: 200 }),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const penalties = pgTable("penalties", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobPostings.id).notNull(),
  fromUserId: uuid("from_user_id").references(() => users.id).notNull(),
  toUserId: uuid("to_user_id").references(() => users.id).notNull(),
  type: penaltyTypeEnum("type").notNull(),
  amount: integer("amount").notNull(),
  reason: text("reason").notNull(),
  status: paymentStatusEnum("status").default("pending").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const reviews = pgTable("reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobPostings.id).notNull(),
  reviewerId: uuid("reviewer_id").references(() => users.id).notNull(),
  revieweeId: uuid("reviewee_id").references(() => users.id).notNull(),
  rating: integer("rating").notNull(), // 1-5
  comment: text("comment"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type EmployerProfile = typeof employerProfiles.$inferSelect
export type WorkerProfile = typeof workerProfiles.$inferSelect
export type JobPosting = typeof jobPostings.$inferSelect
export type NewJobPosting = typeof jobPostings.$inferInsert
export type JobApplication = typeof jobApplications.$inferSelect
export type Payment = typeof payments.$inferSelect
export type Penalty = typeof penalties.$inferSelect
export type Review = typeof reviews.$inferSelect
