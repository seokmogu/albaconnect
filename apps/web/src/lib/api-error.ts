import axios from "axios"

interface ApiErrorBody {
  error?: string
  message?: string
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return fallback

  if (!error.response) {
    return "서버에 연결할 수 없습니다. API 서버 상태를 확인해주세요."
  }

  return error.response?.data?.error ?? error.response?.data?.message ?? fallback
}
