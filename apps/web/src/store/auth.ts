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
        set({ user, accessToken, refreshToken })
      },
      logout: () => {
        localStorage.removeItem("accessToken")
        localStorage.removeItem("refreshToken")
        set({ user: null, accessToken: null, refreshToken: null })
      },
    }),
    { name: "albaconnect-auth" }
  )
)
