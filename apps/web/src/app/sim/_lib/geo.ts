/**
 * 위치·거리 계산 — node:fs 없는 순수 파일. 클라이언트 컴포넌트에서 안전.
 *
 * 지오펜스 체크인(US-12)·라이브 매칭(US-11) 등 거리 기반 로직의 단일 소스.
 */

export interface LatLng {
  lat: number
  lng: number
}

const EARTH_RADIUS_M = 6_371_000

/**
 * 두 좌표 간 대원 거리(미터). Haversine 공식.
 */
export function haversineMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h))
}

/**
 * point가 center 기준 radiusMeters 반경 안에 있으면 true.
 * 지오펜스 체크인 판정에 사용 — 반경 밖이면 체크인 거부.
 */
export function withinGeofence(
  point: LatLng,
  center: LatLng,
  radiusMeters: number,
): boolean {
  return haversineMeters(point, center) <= radiusMeters
}
