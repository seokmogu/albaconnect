let configured = false
let bizApiKey = ''
let senderKey = ''

export function normalizePhone(raw: string): string | null {
  if (!raw) return null
  const digits = raw.replace(/\D/g, '')
  const local = digits.startsWith('82') ? '0' + digits.slice(2) : digits
  if (!/^0(10|11|16|17|18|19)\d{7,8}$/.test(local)) return null
  return local
}

export function initKakaoAlimTalk(): void {
  if (process.env.VITEST) return
  bizApiKey = process.env.KAKAO_BIZ_API_KEY ?? ''
  senderKey = process.env.KAKAO_SENDER_KEY ?? ''
  configured = !!(bizApiKey && senderKey)
  if (!configured) {
    console.log('[AlimTalk] KAKAO_BIZ_API_KEY or KAKAO_SENDER_KEY not set — using console fallback')
  }
}

export async function sendAlimTalk(
  phone: string,
  templateCode: string,
  variables: Record<string, string>
): Promise<void> {
  if (!configured) {
    console.log(`[AlimTalk:dev] Would send ${templateCode} to ${phone}:`, variables)
    return
  }
  const res = await fetch('https://alimtalk-api.kakao.com/v2/sender/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `KakaoAK ${bizApiKey}`,
    },
    body: JSON.stringify({
      senderKey,
      templateCode,
      recipientList: [{ recipientNo: phone, templateParameter: variables }],
    }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as { errorCode?: string; errorMessage?: string }
    throw new Error(`Kakao AlimTalk error: ${body.errorCode ?? res.status} — ${body.errorMessage ?? 'unknown'}`)
  }
}

export async function sendOtpAlimTalk(phone: string, otp: string): Promise<void> {
  const normalized = normalizePhone(phone)
  const target = normalized ?? phone
  await sendAlimTalk(target, 'OTP_VERIFY', { otp })
}
