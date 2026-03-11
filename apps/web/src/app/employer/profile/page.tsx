"use client"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"
import Link from "next/link"
import { useRouter } from "next/navigation"

export default function EmployerProfilePage() {
  const { user, logout } = useAuthStore()
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [stats, setStats] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ companyName: "", businessNumber: "" })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!user) { router.push("/login"); return }
    Promise.all([
      api.get("/employers/profile"),
      api.get("/employers/stats"),
    ]).then(([{ data: p }, { data: s }]) => {
      setProfile(p)
      setStats(s.stats)
      setForm({ companyName: p.companyName ?? "", businessNumber: p.businessNumber ?? "" })
    })
  }, [user, router])

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put("/employers/profile", form)
      setProfile((p: any) => ({ ...p, ...form }))
      setEditing(false)
    } catch {}
    setSaving(false)
  }

  if (!profile) return <div className="flex items-center justify-center h-64 text-gray-400">불러오는 중...</div>

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10 flex items-center justify-between">
        <h1 className="font-bold text-xl">내 프로필</h1>
        <div className="flex gap-3">
          <button onClick={() => setEditing(!editing)} className="text-blue-600 text-sm font-medium">
            {editing ? "취소" : "수정"}
          </button>
          <button onClick={() => { logout(); router.push("/") }} className="text-gray-400 text-sm">로그아웃</button>
        </div>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Profile */}
        <div className="card text-center">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-3xl mx-auto mb-3">🏢</div>
          <div className="font-bold text-xl">{profile.companyName}</div>
          <div className="text-gray-500 text-sm">{user?.name} · {user?.email}</div>
          <div className="flex items-center justify-center gap-1 mt-2">
            <span className="text-yellow-400">⭐</span>
            <span className="font-bold">{Number(profile.ratingAvg).toFixed(1)}</span>
            <span className="text-gray-400 text-sm">({profile.ratingCount}개 리뷰)</span>
          </div>
        </div>

        {/* Stats */}
        {stats && (
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: "총 공고", value: stats.total_jobs, color: "text-gray-800" },
              { label: "활성 공고", value: stats.active_jobs, color: "text-green-600" },
              { label: "완료 공고", value: stats.completed_jobs, color: "text-blue-600" },
              { label: "고용한 인원", value: stats.total_workers_hired, color: "text-purple-600" },
            ].map(s => (
              <div key={s.label} className="card text-center">
                <div className={`text-2xl font-bold ${s.color}`}>{s.value ?? 0}</div>
                <div className="text-xs text-gray-500 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Edit form */}
        {editing && (
          <div className="card space-y-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">회사/상호명</label>
              <input className="input-field" value={form.companyName} onChange={e => setForm(f => ({ ...f, companyName: e.target.value }))} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">사업자등록번호 (선택)</label>
              <input className="input-field" value={form.businessNumber} onChange={e => setForm(f => ({ ...f, businessNumber: e.target.value }))} placeholder="000-00-00000" />
            </div>
            <button onClick={handleSave} disabled={saving} className="btn-primary">
              {saving ? "저장 중..." : "저장"}
            </button>
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t flex">
        <Link href="/employer/dashboard" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">📋</span><span className="text-xs mt-0.5">공고</span>
        </Link>
        <Link href="/employer/profile" className="flex-1 flex flex-col items-center py-3 text-blue-600">
          <span className="text-xl">👤</span><span className="text-xs mt-0.5">프로필</span>
        </Link>
      </nav>
    </div>
  )
}
