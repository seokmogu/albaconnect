"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import api from "@/lib/api"
import { useAuthStore } from "@/store/auth"
import { JOB_CATEGORIES } from "@albaconnect/shared"

export default function WorkerProfilePage() {
  const { user } = useAuthStore()
  const [profile, setProfile] = useState<any>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ bio: "", categories: [] as string[] })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    api.get("/workers/profile").then(({ data }) => {
      setProfile(data)
      setForm({ bio: data.bio ?? "", categories: data.categories ?? [] })
    })
  }, [])

  const toggleCategory = (cat: string) => {
    setForm(f => ({
      ...f,
      categories: f.categories.includes(cat)
        ? f.categories.filter(c => c !== cat)
        : [...f.categories, cat]
    }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.put("/workers/profile", form)
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
        <button onClick={() => setEditing(!editing)} className="text-blue-600 font-medium text-sm">
          {editing ? "취소" : "수정"}
        </button>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Profile Card */}
        <div className="card text-center">
          <div className="w-20 h-20 rounded-full bg-blue-100 flex items-center justify-center text-3xl mx-auto mb-3">
            👤
          </div>
          <div className="font-bold text-xl">{user?.name}</div>
          <div className="text-gray-500 text-sm">{user?.email}</div>
          <div className="flex items-center justify-center gap-1 mt-2">
            <span className="text-yellow-400">⭐</span>
            <span className="font-bold">{Number(profile.ratingAvg).toFixed(1)}</span>
            <span className="text-gray-400 text-sm">({profile.ratingCount}개 리뷰)</span>
          </div>
        </div>

        {/* Categories */}
        <div className="card">
          <h3 className="font-bold text-gray-700 mb-3">가능 직종</h3>
          {editing ? (
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
          ) : (
            <div className="flex flex-wrap gap-2">
              {(profile.categories ?? []).map((cat: string) => (
                <span key={cat} className="bg-blue-50 text-blue-700 px-3 py-1 rounded-full text-sm font-medium">{cat}</span>
              ))}
              {(profile.categories ?? []).length === 0 && (
                <span className="text-gray-400 text-sm">선택된 직종 없음</span>
              )}
            </div>
          )}
        </div>

        {/* Bio */}
        <div className="card">
          <h3 className="font-bold text-gray-700 mb-3">자기소개</h3>
          {editing ? (
            <textarea
              className="input-field h-24 resize-none"
              value={form.bio}
              onChange={e => setForm(f => ({ ...f, bio: e.target.value }))}
              placeholder="간단한 자기소개를 입력하세요"
              maxLength={1000}
            />
          ) : (
            <p className="text-gray-600 text-sm leading-relaxed">
              {profile.bio ?? <span className="text-gray-400">자기소개가 없습니다</span>}
            </p>
          )}
        </div>

        {editing && (
          <button onClick={handleSave} disabled={saving} className="btn-primary">
            {saving ? "저장 중..." : "저장"}
          </button>
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t flex">
        <Link href="/worker/home" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">🏠</span><span className="text-xs mt-0.5">홈</span>
        </Link>
        <Link href="/worker/jobs" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">📋</span><span className="text-xs mt-0.5">알바</span>
        </Link>
        <Link href="/worker/profile" className="flex-1 flex flex-col items-center py-3 text-blue-600">
          <span className="text-xl">👤</span><span className="text-xs mt-0.5">프로필</span>
        </Link>
      </nav>
    </div>
  )
}
