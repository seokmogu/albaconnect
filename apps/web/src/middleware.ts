import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const PUBLIC_PATHS = ["/", "/login", "/signup"]

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Allow public paths
  if (PUBLIC_PATHS.some(p => pathname === p)) {
    return NextResponse.next()
  }

  // Allow static files and API routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.includes(".") // static files
  ) {
    return NextResponse.next()
  }

  // Check for auth token in cookies or Authorization header
  const token = request.cookies.get("auth_token")?.value
  const authHeader = request.headers.get("authorization")

  // In Next.js middleware we can't read localStorage (browser-only)
  // So we use a cookie set by the auth store as a session signal
  // The actual token validation happens on the API side
  if (!token && !authHeader) {
    const loginUrl = new URL("/login", request.url)
    loginUrl.searchParams.set("redirect", pathname)
    return NextResponse.redirect(loginUrl)
  }

  return NextResponse.next()
}

export const config = {
  matcher: [
    "/worker/:path*",
    "/employer/:path*",
    "/notifications",
    "/reviews",
  ],
}
