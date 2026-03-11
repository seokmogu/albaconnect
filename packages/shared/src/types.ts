export type UserRole = "employer" | "worker"

export type JobStatus = "draft" | "open" | "matched" | "in_progress" | "completed" | "cancelled"
export type EscrowStatus = "pending" | "escrowed" | "released" | "refunded"
export type ApplicationStatus = "offered" | "accepted" | "rejected" | "timeout" | "completed" | "noshow"
export type PenaltyType = "worker_noshow" | "employer_noshow" | "employer_cancel_late"
export type PaymentStatus = "pending" | "completed" | "failed" | "refunded"

export interface User {
  id: string
  email: string
  role: UserRole
  name: string
  phone: string
  createdAt: string
}

export interface EmployerProfile {
  userId: string
  companyName: string
  businessNumber?: string
  ratingAvg: number
  ratingCount: number
}

export interface WorkerProfile {
  userId: string
  categories: string[]
  bio?: string
  ratingAvg: number
  ratingCount: number
  isAvailable: boolean
  lastSeenAt?: string
}

export interface JobPosting {
  id: string
  employerId: string
  title: string
  category: string
  startAt: string
  endAt: string
  hourlyRate: number
  totalAmount: number
  headcount: number
  address: string
  lat: number
  lng: number
  description: string
  status: JobStatus
  escrowStatus: EscrowStatus
  createdAt: string
}

export interface JobApplication {
  id: string
  jobId: string
  workerId: string
  status: ApplicationStatus
  offeredAt: string
  respondedAt?: string
  expiresAt: string
}

export interface Review {
  id: string
  jobId: string
  reviewerId: string
  revieweeId: string
  rating: number
  comment?: string
  createdAt: string
}

// Socket.io events
export interface JobOfferEvent {
  jobId: string
  title: string
  category: string
  address: string
  lat: number
  lng: number
  hourlyRate: number
  startAt: string
  durationHours: number
  expiresAt: string
  applicationId: string
}

export type SocketClientToServer = {
  accept_offer: (data: { applicationId: string }) => void
  reject_offer: (data: { applicationId: string }) => void
  update_location: (data: { lat: number; lng: number }) => void
}

export type SocketServerToClient = {
  job_offer: (data: JobOfferEvent) => void
  job_offer_cancelled: (data: { jobId: string }) => void
  job_matched: (data: { jobId: string; workerName: string }) => void
  error: (data: { message: string }) => void
}
