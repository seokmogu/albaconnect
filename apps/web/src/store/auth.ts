"use client"

import { create } from "zustand"
import { persist } from "zustand/middleware"

interface AuthUser {
  id: string
  email: string
  role: "employer" | "worker"
  name: string
}

interface AuthState {
  user: AuthUser | null
  accessToken: string | null
  refreshToken: string | null
  setAuth: (user: AuthUser, accessToken: string, refreshToken: string) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      refreshToken: null,
      setAuth: (user, accessToken, refreshToken) => {
        localStorage.setItem("accessToken", accessToken)
        localStorage.setItem("refreshToken", refreshToken)
        // Set session cookie for middleware auth check (httpOnly not possible from JS, but sufficient as redirect hint)
        document.cookie = `auth_token=1; path=/; max-age=${60 * 60 * 24 * 30}; SameSite=Lax`
        set({ user, accessToken, refreshToken })
      },
      logout: () => {
        localStorage.removeItem("accessToken")
        localStorage.removeItem("refreshToken")
        document.cookie = "auth_token=; path=/; max-age=0"
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    { name: "albaconnect-auth" }
  )
)
