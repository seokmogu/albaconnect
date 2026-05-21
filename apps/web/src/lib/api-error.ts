import axios from "axios"

interface ApiErrorBody {
  error?: string
  message?: string
}

export function getApiErrorMessage(error: unknown, fallback: string): string {
  if (!axios.isAxiosError<ApiErrorBody>(error)) return fallback

  return error.response?.data?.error ?? error.response?.data?.message ?? fallback
}
