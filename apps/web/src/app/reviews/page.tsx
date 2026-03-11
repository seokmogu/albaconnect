"use client"

import { useState, useEffect } from "react"
import { useAuthStore } from "@/store/auth"
import api from "@/lib/api"
import Link from "next/link"

interface Review {
  id: string
  rating: number
  comment?: string
  reviewer_name: string
  job_title: string
  category: string
  created_at: string
}

export default function ReviewsPage() {
  const { user } = useAuthStore()
  const [reviews, setReviews] = useState<Review[]>([])
  const [avgRating, setAvgRating] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!user) return
    api.get(`/reviews/${user.id}`).then(({ data }) => {
      setReviews(data.reviews ?? [])
      if (data.reviews?.length > 0) {
        const avg = data.reviews.reduce((s: number, r: Review) => s + r.rating, 0) / data.reviews.length
        setAvgRating(avg)
      }
    }).finally(() => setLoading(false))
  }, [user])

  const stars = (rating: number) =>
    Array.from({ length: 5 }, (_, i) => (
      <span key={i} className={i < rating ? "text-yellow-400" : "text-gray-200"}>★</span>
    ))

  const ratingCounts = [5, 4, 3, 2, 1].map(r => ({
    rating: r,
    count: reviews.filter(rv => rv.rating === r).length,
    pct: reviews.length > 0 ? (reviews.filter(rv => rv.rating === r).length / reviews.length) * 100 : 0,
  }))

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
      <div className="bg-white px-4 py-4 shadow-sm sticky top-0 z-10">
        <h1 className="font-bold text-xl">내 리뷰</h1>
      </div>

      <div className="px-4 py-6 space-y-4">
        {/* Rating summary */}
        <div className="card">
          <div className="flex items-center gap-6">
            <div className="text-center">
              <div className="text-5xl font-bold text-gray-900">{avgRating.toFixed(1)}</div>
              <div className="flex justify-center mt-1">{stars(Math.round(avgRating))}</div>
              <div className="text-xs text-gray-500 mt-1">{reviews.length}개 리뷰</div>
            </div>
            <div className="flex-1 space-y-1">
              {ratingCounts.map(({ rating, count, pct }) => (
                <div key={rating} className="flex items-center gap-2 text-sm">
                  <span className="text-gray-600 w-4">{rating}</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-2 bg-yellow-400 rounded-full" style={{ width: `${pct}%` }} />
                  </div>
                  <span className="text-gray-400 w-4 text-right">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Reviews list */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">불러오는 중...</div>
        ) : reviews.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-4xl mb-3">⭐</div>
            <div className="text-gray-500">아직 받은 리뷰가 없습니다</div>
          </div>
        ) : (
          reviews.map(review => (
            <div key={review.id} className="card">
              <div className="flex items-center justify-between mb-2">
                <div className="flex">{stars(review.rating)}</div>
                <div className="text-xs text-gray-400">
                  {new Date(review.created_at).toLocaleDateString("ko-KR")}
                </div>
              </div>
              <div className="text-sm font-medium text-gray-700 mb-1">{review.job_title}</div>
              {review.comment && (
                <p className="text-sm text-gray-600 leading-relaxed">{review.comment}</p>
              )}
              <div className="text-xs text-gray-400 mt-2">— {review.reviewer_name}</div>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
