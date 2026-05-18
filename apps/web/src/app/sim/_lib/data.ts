/**
 * Server-side loaders for the simulator data files.
 * Files live at <repo>/sim/data/*.json (outside apps/web).
 *
 * Used by the /sim/* server components — never import from a client component.
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import type { ServiceRequest } from "./service"

// 용역 트랙 타입·상수는 클라이언트 안전한 service.ts에서 관리. 서버 컴포넌트
// 호환을 위해 data.ts에서도 re-export 한다.
export type { ContractType, ServiceCategory, ServiceRequest } from "./service"
export { SERVICE_CATEGORY_LABEL, detectRepeatRequesters } from "./service"

const SIM_DATA_DIR = join(process.cwd(), "..", "..", "sim", "data")

export interface Employer {
  id: string
  name: string
  category: string
  dong: string
  nearestHub: string
  location: { lat: number; lng: number }
  persona: string
  avgRating: number
  reviewCount: number
  monthlyJobBudget: number
  createdAt: string
}

export interface PostingDraft {
  title: string
  category: string
  hourlyRate: number
  headcount: number
  durationHours: number
  startAtIso?: string
  address: string
  description: string
  tags: string[]
  confidence: number
}

// 고용형태: 긱(건단위 초단기) / 일일 / 단기 / 장기(정기)
export type EmploymentType = "gig" | "daily" | "short" | "long"

export const EMPLOYMENT_LABEL: Record<EmploymentType, string> = {
  gig: "긱",
  daily: "일일",
  short: "단기",
  long: "장기",
}

export interface Posting {
  id: string
  employerId: string
  employerName: string
  employerLocation: { lat: number; lng: number }
  rawText: string
  draft: PostingDraft
  employmentType?: EmploymentType
  createdAt: string
}

export interface ScheduleRule {
  id: string
  days: number[] // 0=일 ~ 6=토
  startMin: number // 0~1439
  endMin: number
  hubName: string
  center: { lat: number; lng: number }
  radiusMeters: number
}

export interface Availability {
  schedule: ScheduleRule[]
  live: {
    enabled: boolean
    currentLocation: { lat: number; lng: number } | null
    radiusMeters: number
  }
}

export interface Worker {
  id: string
  name: string
  persona: string
  location: { lat: number; lng: number }
  categories: string[]
  avgRating: number
  ratingCount: number
  completionRate: number
  verified: boolean
  lastSeenAt: number
  available: boolean
  availability?: Availability
  preferredEmploymentTypes?: EmploymentType[]
}

export interface DispatchDecision {
  workerId: string
  decision: "accept" | "reject"
  reason: string
  secondsToDecide: number
  score: number
}

export interface Dispatch {
  postingId: string
  employerName?: string
  jobCategory?: string
  rankedWorkerIds: string[]
  scores: Record<string, number>
  decisions?: DispatchDecision[]
  acceptedBy: string | null
  acceptedReason?: string | null
  acceptedAt?: string | null
  acceptedSecondsToDecide?: number | null
  notifiedAt: string
  reason?: string
}

async function loadJson<T>(file: string, fallback: T): Promise<T> {
  try {
    const raw = await readFile(join(SIM_DATA_DIR, file), "utf8")
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

export async function loadEmployers(): Promise<Employer[]> {
  const data = await loadJson<{ employers?: Employer[] }>("employers.json", {})
  return data.employers ?? []
}

export async function loadPostings(): Promise<Posting[]> {
  const data = await loadJson<{ postings?: Posting[] }>("postings.json", {})
  return data.postings ?? []
}

export async function loadWorkers(): Promise<Worker[]> {
  const data = await loadJson<{ workers?: Worker[] }>("workers.json", {})
  return data.workers ?? []
}

export async function loadDispatches(): Promise<Dispatch[]> {
  const data = await loadJson<{ dispatches?: Dispatch[] }>("dispatches.json", {})
  return data.dispatches ?? []
}

// ── 용역 트랙 (개인 C2C) 로더 ─────────────────────────────────────────────────

export async function loadServiceRequests(): Promise<ServiceRequest[]> {
  const data = await loadJson<{ requests?: ServiceRequest[] }>("service-requests.json", {})
  return data.requests ?? []
}

export interface SimSnapshot {
  employers: Employer[]
  postings: Posting[]
  workers: Worker[]
  dispatches: Dispatch[]
  generatedAt: string
}

export async function loadSnapshot(): Promise<SimSnapshot> {
  const [employers, postings, workers, dispatches] = await Promise.all([
    loadEmployers(),
    loadPostings(),
    loadWorkers(),
    loadDispatches(),
  ])
  return { employers, postings, workers, dispatches, generatedAt: new Date().toISOString() }
}
