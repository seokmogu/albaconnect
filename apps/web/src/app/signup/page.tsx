"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"
import { JOB_CATEGORIES } from "@albaconnect/shared"

export default function SignupPage() {
  const router = useRouter()
  const { setAuth } = useAuthStore()
  const [step, setStep] = useState<"role" | "form">("role")
  const [role, setRole] = useState<"employer" | "worker" | null>(null)
  const [form, setForm] = useState({
    email: "", password: "", name: "", phone: "",
    companyName: "", categories: [] as string[]
  })
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  const toggleCategory = (cat: string) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat]
    }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError("")
    setLoading(true)
    try {
      const payload = {
        ...form,
        role,
        companyName: role === "employer" ? form.companyName : undefined,
        categories: role === "worker" ? form.categories : undefined,
      }
      const { data } = await api.post("/auth/signup", payload)
      setAuth(data.user, data.accessToken, data.refreshToken)
      router.push(role === "employer" ? "/employer/dashboard" : "/worker/home")
    } catch (err: any) {
      setError(err.response?.data?.error ?? "회원가입에 실패했습니다")
    } finally {
      setLoading(false)
    }
  }

  if (step === "role") {
    return (
      <div className="min-h-screen flex flex-col justify-center px-6 py-12 bg-gray-50">
        <div className="mb-10 text-center">
          <div className="text-5xl mb-3">⚡</div>
          <h1 className="text-2xl font-bold">AlbaConnect 가입</h1>
          <p className="text-gray-500 mt-1">어떤 역할로 시작하시나요?</p>
        </div>
        <div className="space-y-4">
          <button
            onClick={() => { setRole("worker"); setStep("form") }}
            className="card w-full text-left p-5 border-2 hover:border-blue-500 transition-colors"
          >
            <div className="text-3xl mb-2">💼</div>
            <div className="font-bold text-lg">구직자로 시작</div>
            <div className="text-gray-500 text-sm mt-1">내 위치에서 바로 알바 매칭받기</div>
          </button>
          <button
            onClick={() => { setRole("employer"); setStep("form") }}
            className="card w-full text-left p-5 border-2 hover:border-blue-500 transition-colors"
          >
            <div className="text-3xl mb-2">🏢</div>
            <div className="font-bold text-lg">구인자로 시작</div>
            <div className="text-gray-500 text-sm mt-1">주변 구직자를 빠르게 구인하기</div>
          </button>
        </div>
        <p className="text-center text-sm text-gray-500 mt-8">
          이미 계정이 있으신가요?{" "}
          <Link href="/login" className="text-blue-600 font-medium">로그인</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="min-h-screen px-6 py-8 bg-gray-50">
      <button onClick={() => setStep("role")} className="text-gray-500 mb-6 flex items-center gap-1">
        ← 역할 선택으로
      </button>
      <h2 className="text-2xl font-bold mb-6">
        {role === "employer" ? "🏢 구인자" : "💼 구직자"} 회원가입
      </h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">{error}</div>
        )}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이름</label>
          <input className="input-field" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="홍길동" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">이메일</label>
          <input type="email" className="input-field" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="example@email.com" required />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">비밀번호</label>
          <input type="password" className="input-field" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder="8자 이상" required minLength={8} />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">전화번호</label>
          <input type="tel" className="input-field" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} placeholder="010-1234-5678" required />
        </div>

        {role === "employer" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">회사/상호명</label>
            <input className="input-field" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} placeholder="(주)알바커넥트" required />
          </div>
        )}

        {role === "worker" && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">직종 선택 (복수)</label>
            <div className="flex flex-wrap gap-2">
              {JOB_CATEGORIES.map(cat => (
                <button
                  key={cat} type="button"
                  onClick={() => toggleCategory(cat)}
                  className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
                    form.categories.includes(cat)
                      ? "bg-blue-600 text-white border-blue-600"
                      : "bg-white text-gray-600 border-gray-300"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        )}

        <button type="submit" className="btn-primary mt-2" disabled={loading}>
          {loading ? "가입 중..." : "가입하기"}
        </button>
      </form>
    </div>
  )
}
