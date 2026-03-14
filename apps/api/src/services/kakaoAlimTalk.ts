/**
 * KakaoTalk Alim Talk (알림톡) notification service
 *
 * Sends structured Alim Talk messages to Korean mobile workers via Kakao Biz Message API.
 * Mirrors the webPush.ts pattern: VITEST guard, dev-safe fallback, factory pattern.
 *
 * Setup:
 *  1. Register your channel at https://center-pf.kakao.com
 *  2. Register each template and obtain template codes
 *  3. Set KAKAO_BIZ_API_KEY and KAKAO_SENDER_KEY environment variables
 *
 * Alim Talk template codes used (register these in Kakao Biz console before use):
 *  - JOB_AVAILABLE   : new job offer notification
 *  - JOB_CONFIRMED   : job acceptance confirmed
 *  - PAYMENT_COMPLETE: payout completed
 */

let kakaoConfigured = false

/**
 * Normalize a raw phone number to Korean domestic format (e.g. "01012345678").
 * Returns null if the number cannot be recognized as a valid Korean mobile number.
 */
export function normalizePhone(raw: string): string | null {
  // Strip all non-digit characters
  let digits = raw.replace(/\D/g, "")

  // Strip country code +82 / 82
  if (digits.startsWith("82") && digits.length > 10) {
    digits = "0" + digits.slice(2)
  }

  // Valid Korean mobile prefixes and lengths (10 or 11 digits)
  const validPrefixes = ["010", "011", "016", "017", "018", "019"]
  const isValid =
    validPrefixes.some((p) => digits.startsWith(p)) &&
    (digits.length === 10 || digits.length === 11)

  return isValid ? digits : null
}

export function initKakaoAlimTalk(): void {
  // Skip in test environment to avoid accidental API calls
  if (process.env["VITEST"]) return

  const apiKey = process.env["KAKAO_BIZ_API_KEY"]
  const senderKey = process.env["KAKAO_SENDER_KEY"]

  if (apiKey && senderKey) {
    kakaoConfigured = true
    console.log("[KakaoAlimTalk] Configured — ready to send Alim Talk messages")
  } else {
    console.log(
      "[KakaoAlimTalk] KAKAO_BIZ_API_KEY or KAKAO_SENDER_KEY not set — running in dev-stub mode"
    )
  }
}

export function isKakaoConfigured(): boolean {
  return kakaoConfigured
}

export interface AlimTalkPayload {
  phone: string
  templateCode: string
  variables: Record<string, string>
}

/**
 * Send an Alim Talk message via Kakao Biz Message API.
 *
 * Authentication: apiKey: {KAKAO_BIZ_API_KEY}
 * KAKAO_SENDER_KEY (plusfriend sender key) is sent in the request body.
 *
 * In dev mode (key not set): logs the intent without calling the API.
 * Throws on non-2xx response with parsed Kakao error code for debugging.
 */
export async function sendAlimTalk(payload: AlimTalkPayload): Promise<void> {
  const normalizedPhone = normalizePhone(payload.phone)
  if (!normalizedPhone) {
    console.warn(
      `[KakaoAlimTalk] Invalid or non-Korean phone number: ${payload.phone.slice(0, 4)}*** — skipping`
    )
    return
  }

  if (!isKakaoConfigured()) {
    // Dev-stub: log intent without calling the API
    console.log(
      `[KakaoAlimTalk:dev] Would send template '${payload.templateCode}' to ${normalizedPhone.slice(0, 3)}***${normalizedPhone.slice(-2)}`
    )
    return
  }

  const apiKey = process.env["KAKAO_BIZ_API_KEY"]!
  const senderKey = process.env["KAKAO_SENDER_KEY"]!

  const res = await fetch(
    "https://api.bizmessage.kakao.com/talk/bizmessage/v1/send",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apiKey: apiKey,
      },
      body: JSON.stringify({
        senderKey,
        templateCode: payload.templateCode,
        recipientList: [
          {
            recipientNo: normalizedPhone,
            templateParameter: payload.variables,
          },
        ],
      }),
    }
  )

  if (!res.ok) {
    let errorBody: { errorCode?: string; errorMessage?: string } = {}
    try {
      errorBody = (await res.json()) as typeof errorBody
    } catch {
      // Ignore JSON parse failure on error body
    }
    throw new Error(
      `[KakaoAlimTalk] API error ${res.status}: ${errorBody.errorCode ?? "UNKNOWN"} — ${errorBody.errorMessage ?? res.statusText}`
    )
  }
}

// ---------------------------------------------------------------------------
// Template helpers
// ---------------------------------------------------------------------------

/**
 * Send job_available Alim Talk to a worker.
 * Template: "#{jobTitle} 알바 제안이 도착했습니다! 📍#{address} | #{hourlyRate}원/시간 | 수락 마감: #{expiresAt}"
 *
 * TODO: Register this template at https://center-pf.kakao.com before production use.
 * Template code: JOB_AVAILABLE
 */
export async function jobAvailableAlimTalk(params: {
  phone: string
  jobTitle: string
  hourlyRate: number
  address: string
  expiresAt: string
}): Promise<void> {
  await sendAlimTalk({
    phone: params.phone,
    templateCode: "JOB_AVAILABLE", // TODO: register at Kakao Biz console
    variables: {
      jobTitle: params.jobTitle,
      hourlyRate: params.hourlyRate.toLocaleString("ko-KR"),
      address: params.address,
      expiresAt: new Date(params.expiresAt).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        hour: "2-digit",
        minute: "2-digit",
      }),
    },
  })
}

/**
 * Send job_confirmed Alim Talk to a worker.
 * Template: "#{jobTitle} 알바가 확정되었습니다! 📅 시작: #{startAt} | 📍#{address}"
 *
 * TODO: Register this template at https://center-pf.kakao.com before production use.
 * Template code: JOB_CONFIRMED
 */
export async function jobConfirmedAlimTalk(params: {
  phone: string
  jobTitle: string
  startAt: string
  address: string
}): Promise<void> {
  await sendAlimTalk({
    phone: params.phone,
    templateCode: "JOB_CONFIRMED", // TODO: register at Kakao Biz console
    variables: {
      jobTitle: params.jobTitle,
      startAt: new Date(params.startAt).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
        month: "long",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      address: params.address,
    },
  })
}

/**
 * Send payment_complete Alim Talk to a worker.
 * Template: "#{jobTitle} 급여 #{amount}원이 입금되었습니다! 💰"
 *
 * TODO: Register this template at https://center-pf.kakao.com before production use.
 * Template code: PAYMENT_COMPLETE
 */
export async function paymentCompleteAlimTalk(params: {
  phone: string
  jobTitle: string
  amount: number
}): Promise<void> {
  await sendAlimTalk({
    phone: params.phone,
    templateCode: "PAYMENT_COMPLETE", // TODO: register at Kakao Biz console
    variables: {
      jobTitle: params.jobTitle,
      amount: params.amount.toLocaleString("ko-KR"),
    },
  })
}
