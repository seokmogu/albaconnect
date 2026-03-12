"use client"

import { useEffect, useRef, useState } from "react"

interface MarkerData {
  lat: number
  lng: number
  title?: string
  category?: string
  hourlyRate?: number
}

interface Props {
  lat: number
  lng: number
  zoom?: number
  markers?: MarkerData[]
  selectable?: boolean
  onSelect?: (lat: number, lng: number) => void
  className?: string
}

declare global {
  interface Window {
    kakao: any
  }
}

export default function KakaoMap({
  lat, lng, zoom = 14, markers = [], selectable = false, onSelect, className = "w-full h-64 rounded-2xl"
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const mapRef = useRef<any>(null)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const apiKey = process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY
    if (!apiKey) {
      console.warn("NEXT_PUBLIC_KAKAO_MAP_API_KEY not set — map disabled")
      return
    }

    if (window.kakao?.maps) {
      setLoaded(true)
      return
    }

    const script = document.createElement("script")
    script.src = `//dapi.kakao.com/v2/maps/sdk.js?appkey=${apiKey}&autoload=false`
    script.onload = () => {
      window.kakao.maps.load(() => setLoaded(true))
    }
    document.head.appendChild(script)
  }, [])

  useEffect(() => {
    if (!loaded || !containerRef.current) return

    const { maps } = window.kakao
    const center = new maps.LatLng(lat, lng)
    const options = { center, level: zoom }

    const map = new maps.Map(containerRef.current, options)
    mapRef.current = map

    // Add markers
    const allMarkers = [{ lat, lng, title: "기준 위치" }, ...markers]
    allMarkers.forEach((m) => {
      const pos = new maps.LatLng(m.lat, m.lng)
      const marker = new maps.Marker({ map, position: pos })

      if (m.title) {
        const infoContent = m.category
          ? `<div style="padding:6px 10px;font-size:12px;font-weight:bold;white-space:nowrap;">${m.category} · ${m.hourlyRate?.toLocaleString()}원</div>`
          : `<div style="padding:6px 10px;font-size:12px;">${m.title}</div>`

        const infoWindow = new maps.InfoWindow({ content: infoContent, removable: true })
        maps.event.addListener(marker, "click", () => infoWindow.open(map, marker))
      }
    })

    // Selectable mode — click to set location
    if (selectable && onSelect) {
      maps.event.addListener(map, "click", (e: any) => {
        const latlng = e.latLng
        onSelect(latlng.getLat(), latlng.getLng())

        // Move marker to new position
        new maps.Marker({ map, position: latlng })
      })
    }
  }, [loaded, lat, lng, zoom, markers, selectable, onSelect])

  if (!process.env.NEXT_PUBLIC_KAKAO_MAP_API_KEY) {
    return (
      <div className={`${className} bg-gray-100 flex items-center justify-center`}>
        <div className="text-center text-gray-400">
          <div className="text-3xl mb-1">🗺️</div>
          <div className="text-sm">KAKAO_MAP_API_KEY 미설정</div>
        </div>
      </div>
    )
  }

  return (
    <div className={`relative ${className}`}>
      <div ref={containerRef} className="w-full h-full rounded-2xl overflow-hidden" />
      {!loaded && (
        <div className="absolute inset-0 bg-gray-100 rounded-2xl flex items-center justify-center">
          <div className="text-gray-400 text-sm">지도 로딩 중...</div>
        </div>
      )}
    </div>
  )
}
