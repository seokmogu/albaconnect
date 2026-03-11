"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"

export default function LoginPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const { data } = await api.post("/auth/login", { email, password })
      setAuth(data.user, data.accessToken, data.refreshToken)
      router.push(data.user.role === "employer" ? "/employer/dashboard" : "/worker/home")
    } catch (err: any) {
      setError(err.response?.data?.error ?? "로그인에 실패했습니다")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-gray-50">
      <div className="mb-8 text-center">
        <div className="text-5xl mb-3">⚡</div>
        <h1 className="text-2xl font-bold text-gray-900">AlbaConnect</h1>
        <p className="text-gray-500 mt-1">로그인</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input
            type="email"
            className="input-field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="example@email.com"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input
            type="password"
            className="input-field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
            required
          />
        </div>
        <button type="submit" className="btn-primary mt-2" disabled={loading}>
          {loading ? "로그인 중..." : "로그인"}
        </button>
      </form>

      <p className="text-center text-sm text-gray-500 mt-6">
        계정이 없으신가요?{" "}
        <Link href="/signup" className="text-blue-600 font-medium">회원가입</Link>
      </p>
    </div>
  )
}
