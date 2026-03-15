import { pgTable, uuid, varchar, text, timestamp, boolean, integer, decimal, pgEnum, customType, jsonb, date, time, uniqueIndex } from "drizzle-orm/pg-core"
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
export const referralStatusEnum = pgEnum("referral_status", ["pending", "qualified", "rewarded"])
export const workerCertTypeEnum = pgEnum("worker_cert_type", ["ID_VERIFIED", "DRIVER_LICENSE", "FOOD_HANDLER", "FORKLIFT", "FIRST_AID"])
export const certStatusEnum = pgEnum("cert_status", ["pending", "verified", "expired", "rejected"])
export const disputeTypeEnum = pgEnum("dispute_type", ["NOSHOW_DISPUTE", "PAYMENT_DISPUTE", "QUALITY_DISPUTE"])
export const disputeStatusEnum = pgEnum("dispute_status", ["open", "resolved", "dismissed"])
export const jobStatusEnum = pgEnum("job_status", ["draft", "open", "matched", "in_progress", "completed", "cancelled"])
export const paymentStatusEnum2 = pgEnum("payment_status_job", ["pending", "triggered", "completed", "failed"])
export const escrowStatusEnum = pgEnum("escrow_status", ["pending", "escrowed", "released", "refunded"])
export const applicationStatusEnum = pgEnum("application_status", ["offered", "accepted", "rejected", "timeout", "completed", "noshow"])
export const penaltyTypeEnum = pgEnum("penalty_type", ["worker_noshow", "employer_noshow", "employer_cancel_late"])
export const penaltyAppealStatusEnum = pgEnum("penalty_appeal_status", ["none", "pending", "approved", "rejected"])
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
  isSuspended: boolean("is_suspended").notNull().default(false),
  planTier: varchar("plan_tier", { length: 20 }).notNull().default("free"),  // free|basic|premium
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const workerProfiles = pgTable("worker_profiles", {
  userId: uuid("user_id").primaryKey().references(() => users.id),
  categories: text("categories").array().default(sql`ARRAY[]::text[]`).notNull(),
  bio: text("bio"),
  ratingAvg: decimal("rating_avg", { precision: 3, scale: 2 }).default("0").notNull(),
  ratingCount: integer("rating_count").default(0).notNull(),
  isAvailable: boolean("is_available").default(false).notNull(),
  isSuspended: boolean("is_suspended").notNull().default(false),
  isPhoneVerified: boolean("is_phone_verified").notNull().default(false),
  inviteCode: varchar("invite_code", { length: 12 }),
  location: point("location"),
  lastSeenAt: timestamp("last_seen_at"),
  lastAlertSentAt: timestamp("last_alert_sent_at"),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
  // Web Push subscription (nullable — set when worker grants notification permission)
  pushSubscription: jsonb("push_subscription"),
  // FCM token for Android/iOS push notifications
  fcmToken: varchar("fcm_token", { length: 255 }),
})

export const workerAvailability = pgTable("worker_availability", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").references(() => users.id).notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: varchar("start_time", { length: 5 }).notNull(),
  endTime: varchar("end_time", { length: 5 }).notNull(),
  timezone: varchar("timezone", { length: 50 }).default("Asia/Seoul").notNull(),
  validFrom: timestamp("valid_from").notNull(),
  validUntil: timestamp("valid_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const workerBlackout = pgTable("worker_blackout", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").references(() => users.id).notNull(),
  blackoutDate: date("blackout_date").notNull(),
  reason: text("reason"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export const jobTemplates = pgTable("job_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  employerId: uuid("employer_id").references(() => users.id).notNull(),
  name: varchar("name", { length: 200 }).notNull(),
  description: text("description").notNull(),
  category: varchar("category", { length: 100 }).notNull(),
  hourlyRate: integer("hourly_rate").notNull(),
  requiredSkills: text("required_skills").array().default(sql`ARRAY[]::text[]`).notNull(),
  durationHours: integer("duration_hours").notNull(),
  headcount: integer("headcount").default(1).notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
})

export const jobPostings = pgTable("job_postings", {
  id: uuid("id").primaryKey().defaultRandom(),
  employerId: uuid("employer_id").references(() => users.id).notNull(),
  templateId: uuid("template_id").references(() => jobTemplates.id),
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
  disputeHold: boolean("dispute_hold").default(false).notNull(),
  surgeMultiplier: decimal("surge_multiplier", { precision: 3, scale: 2 }).default("1.00").notNull(),
  statusUpdatedAt: timestamp("status_updated_at"),
  completedAt: timestamp("completed_at"),
  invoiceDownloadedAt: timestamp("invoice_downloaded_at"),
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
  tossOrderId: varchar("toss_order_id", { length: 100 }).unique(),
  tossStatus: varchar("toss_status", { length: 50 }),
  payoutAt: timestamp("payout_at"),
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
  appealStatus: penaltyAppealStatusEnum("appeal_status").default("none").notNull(),
  appealNote: text("appeal_note"),
  appealSubmittedAt: timestamp("appeal_submitted_at", { withTimezone: true }),
  adminAppealNote: text("admin_appeal_note"),
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


// ── Dispute resolution ─────────────────────────────────────────────────────────
// disputeTypeEnum and disputeStatusEnum defined at top of file
export const disputeRaisedByRoleEnum = pgEnum("dispute_raised_by_role", ["worker", "employer"])

export const jobDisputes = pgTable("job_disputes", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobPostings.id).notNull(),
  raisedById: uuid("raised_by_id").references(() => users.id).notNull(),
  raisedByRole: disputeRaisedByRoleEnum("raised_by_role").notNull(),
  type: disputeTypeEnum("type").notNull(),
  description: text("description").notNull(),
  status: disputeStatusEnum("status").default("open").notNull(),
  resolutionNotes: text("resolution_notes"),
  resolvedBy: uuid("resolved_by").references(() => users.id),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
})

export const workerCertifications = pgTable("worker_certifications", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id").references(() => users.id).notNull(),
  type: workerCertTypeEnum("type").notNull(),
  status: certStatusEnum("status").default("pending").notNull(),
  evidenceUrl: text("evidence_url"),
  verifiedBy: uuid("verified_by").references(() => users.id),
  verifiedAt: timestamp("verified_at"),
  expiresAt: timestamp("expires_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type JobDispute = typeof jobDisputes.$inferSelect
export type NewJobDispute = typeof jobDisputes.$inferInsert
export type WorkerCertification = typeof workerCertifications.$inferSelect
export type NewWorkerCertification = typeof workerCertifications.$inferInsert

// ── Referral system ────────────────────────────────────────────────────────────
export const referrals = pgTable("referrals", {
  id: uuid("id").primaryKey().defaultRandom(),
  referrerId: uuid("referrer_id").references(() => users.id).notNull(),
  refereeId: uuid("referee_id").references(() => users.id).notNull().unique(),
  status: referralStatusEnum("status").default("pending").notNull(),
  bonusAmount: integer("bonus_amount").default(5000).notNull(),
  qualifiedAt: timestamp("qualified_at"),
  rewardedAt: timestamp("rewarded_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type Referral = typeof referrals.$inferSelect
export type NewReferral = typeof referrals.$inferInsert

// ── Employer favorites (worker shortlist) ──────────────────────────────────────
export const employerFavorites = pgTable(
  "employer_favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    employerId: uuid("employer_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    workerId: uuid("worker_id").references(() => users.id, { onDelete: "cascade" }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => ({
    employerWorkerUniq: uniqueIndex("employer_favorites_employer_worker_uniq").on(table.employerId, table.workerId),
  })
)

export type EmployerFavorite = typeof employerFavorites.$inferSelect
export type NewEmployerFavorite = typeof employerFavorites.$inferInsert

export type User = typeof users.$inferSelect
export type NewUser = typeof users.$inferInsert
export type EmployerProfile = typeof employerProfiles.$inferSelect
export type WorkerProfile = typeof workerProfiles.$inferSelect
export type JobTemplate = typeof jobTemplates.$inferSelect
export type NewJobTemplate = typeof jobTemplates.$inferInsert
export type JobPosting = typeof jobPostings.$inferSelect
export type NewJobPosting = typeof jobPostings.$inferInsert
export type JobApplication = typeof jobApplications.$inferSelect
export type Payment = typeof payments.$inferSelect
export type Penalty = typeof penalties.$inferSelect
export type NewPenalty = typeof penalties.$inferInsert
export type Review = typeof reviews.$inferSelect



// ============================================================
// messages (고용주-근로자 다이렉트 메시지)
// ============================================================
export const messages = pgTable("messages", {
  id: uuid("id").primaryKey().defaultRandom(),
  jobId: uuid("job_id").references(() => jobPostings.id, { onDelete: "cascade" }).notNull(),
  senderId: uuid("sender_id").references(() => users.id).notNull(),
  recipientId: uuid("recipient_id").references(() => users.id).notNull(),
  body: text("body").notNull(),
  readAt: timestamp("read_at"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type Message = typeof messages.$inferSelect
export type NewMessage = typeof messages.$inferInsert

// ============================================================
// shift_templates (근로자 반복 교대 스케줄 템플릿)
// ============================================================
export const shiftTemplates = pgTable("shift_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  workerId: uuid("worker_id")
    .references(() => workerProfiles.userId, { onDelete: "cascade" })
    .notNull(),
  dayOfWeek: integer("day_of_week").notNull(),
  startTime: time("start_time").notNull(),
  endTime: time("end_time").notNull(),
  repeatUntil: date("repeat_until"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
})

export type ShiftTemplate = typeof shiftTemplates.$inferSelect
export type NewShiftTemplate = typeof shiftTemplates.$inferInsert
