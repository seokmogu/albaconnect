/**
 * /sim/me — 레거시 진입 경로. 메인페이지(/sim)로 통합되었으므로 리다이렉트.
 */
import { redirect } from "next/navigation"

export default function MeRedirect() {
  redirect("/sim")
}
