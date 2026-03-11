"use client"

import { useState, useEffect } from "react"
import api from "@/lib/api"
import Link from "next/link"

interface Earning {
  id: string
  job_title: string
  start_at: string
  hourly_rate: number
  total_amount: number
  status: string
  employer_name: string
}

export default function WorkerEarningsPage() {
  const [earnings, setEarnings] = useState<Earning[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get("/applications", { params: { status: "completed" } }).then(({ data }) => {
      setEarnings(data.applications ?? [])
    }).finally(() => setLoading(false))
  }, [])

  const totalEarned = earnings.reduce((s, e) => s + (e.total_amount ?? 0), 0)
  const platformFee = Math.round(totalEarned * 0.1)
  const netEarned = totalEarned - platformFee

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold text-xl">수입 내역</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Summary card */}
        <div className="bg-blue-600 text-white rounded-2xl p-5">
          <div className="text-sm text-blue-200 mb-1">총 수입 ({earnings.length}건)</div>
          <div className="text-3xl font-bold mb-3">{netEarned.toLocaleString()}원</div>
          <div className="flex gap-4 text-sm text-blue-200">
            <span>총 임금: {totalEarned.toLocaleString()}원</span>
            <span>수수료: -{platformFee.toLocaleString()}원</span>
          </div>
        </div>

        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : earnings.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">💰</div>
            <div className="text-gray-500">완료된 알바 내역이 없습니다</div>
          </div>
        ) : (
          <div className="space-y-3">
            {earnings.map(e => {
              const net = Math.round((e.total_amount ?? 0) * 0.9)
              return (
                <div key={e.id} className="card flex items-center justify-between">
                  <div>
                    <div className="font-medium text-gray-900">{e.job_title}</div>
                    <div className="text-sm text-gray-500 mt-0.5">
                      {new Date(e.start_at).toLocaleDateString("ko-KR")} · {e.employer_name}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-green-600">+{net.toLocaleString()}원</div>
                    <div className="text-xs text-gray-400">수수료 후</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      <nav className="fixed bottom-0 inset-x-0 max-w-md mx-auto bg-white border-t flex">
        <Link href="/worker/home" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">🏠</span><span className="text-xs mt-0.5">홈</span>
        </Link>
        <Link href="/worker/search" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">🔍</span><span className="text-xs mt-0.5">찾기</span>
        </Link>
        <Link href="/worker/jobs" className="flex-1 flex flex-col items-center py-3 text-gray-400">
          <span className="text-xl">📋</span><span className="text-xs mt-0.5">알바</span>
        </Link>
        <Link href="/worker/earnings" className="flex-1 flex flex-col items-center py-3 text-blue-600">
          <span className="text-xl">💰</span><span className="text-xs mt-0.5">수입</span>
        </Link>
      </nav>
    </div>
  )
}
