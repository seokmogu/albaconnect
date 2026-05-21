import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001"

export const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
})

// Attach token from localStorage
api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("accessToken")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

// Auto-refresh on 401
api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config
    if (error.response?.status === 401 && original && !original._retry) {
      original._retry = true
      try {
        const refreshToken = typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null
        if (!refreshToken) throw new Error("No refresh token")

        const { data } = await axios.post(`${API_URL}/auth/refresh`, { refreshToken }, { withCredentials: true })
        localStorage.setItem("accessToken", data.accessToken)
        original.headers.Authorization = `Bearer ${data.accessToken}`
        return api(original)
      } catch {
        if (typeof window !== "undefined") {
          localStorage.removeItem("accessToken")
          localStorage.removeItem("refreshToken")
          window.location.href = "/login"
        }
      }
    }
    return Promise.reject(error)
  }
)

export default api
