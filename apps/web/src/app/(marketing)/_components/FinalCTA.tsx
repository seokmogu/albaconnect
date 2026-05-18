"use client"

import { useState } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { copy } from "../_content/copy"
import { submitWaitlist, type WaitlistRole } from "../_lib/waitlist"
import { Button } from "@/components/ui/Button"

const schema = z.object({
  role: z.enum(["employer", "worker"], {
    errorMap: () => ({ message: "사장님 또는 워커를 선택해 주세요." }),
  }),
  email: z
    .string()
    .min(1, "이메일을 입력해 주세요.")
    .email("올바른 이메일 주소를 입력해 주세요."),
  phone: z
    .string()
    .optional()
    .refine(
      (v: string | undefined) => !v || /^010-\d{4}-\d{4}$/.test(v),
      "올바른 휴대폰 번호를 입력해 주세요. (예: 010-0000-0000)",
    ),
  region: z.string().min(2, "주 활동 지역을 선택해 주세요."),
  businessNumber: z
    .string()
    .optional()
    .refine(
      (v: string | undefined) => !v || /^\d{3}-\d{2}-\d{5}$/.test(v),
      "사업자등록번호는 000-00-00000 형식으로 입력해 주세요.",
    ),
  consent: z.literal(true, {
    errorMap: () => ({ message: "개인정보 수집에 동의해 주세요." }),
  }),
}).superRefine((val, ctx) => {
  if (val.role === "employer" && (!val.businessNumber || val.businessNumber.trim() === "")) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["businessNumber"],
      message: "사장님은 사업자등록번호를 입력해 주세요.",
    })
  }
})

type FormValues = z.infer<typeof schema>

export function FinalCTA() {
  const { sectionTitle, subtitle, formLabels, thankYou } = copy.finalCta
  const titleLines = sectionTitle.split("\n")

  const [submitted, setSubmitted] = useState(false)
  const [submitError, setSubmitError] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    watch,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { role: undefined, email: "", phone: "", region: "", businessNumber: "", consent: undefined },
  })

  const selectedRole = watch("role")

  const onSubmit = async (data: FormValues) => {
    setSubmitError(null)
    try {
      await submitWaitlist({
        role: data.role as WaitlistRole,
        email: data.email,
        phone: data.phone ?? undefined,
        region: data.region,
        consent: data.consent,
      })
      setSubmitted(true)
    } catch {
      setSubmitError("일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요.")
    }
  }

  return (
    <section
      id="final-cta"
      aria-labelledby="finalcta-title"
      className="bg-secondary py-16 md:py-20 lg:py-24"
    >
      <div className="mx-auto w-full max-w-screen-xl px-4 md:px-6 xl:px-8">
        <div className="text-center mb-10">
          <h2
            id="finalcta-title"
            className="text-2xl md:text-3xl font-bold text-white leading-tight mb-3"
          >
            {titleLines.map((line, i) => (
              <span key={i}>
                {line}
                {i < titleLines.length - 1 && <br />}
              </span>
            ))}
          </h2>
          <p className="text-slate-400 text-base leading-relaxed max-w-md mx-auto">{subtitle}</p>
        </div>

        <div className="max-w-md mx-auto bg-white rounded-xl shadow-hover p-8">
          {/* Success state */}
          {submitted ? (
            <div
              aria-live="polite"
              className="flex flex-col items-center gap-4 py-6 text-center"
            >
              <svg
                width={48}
                height={48}
                viewBox="0 0 24 24"
                fill="none"
                stroke="#10B981"
                strokeWidth={1.5}
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22 4 12 14.01 9 11.01" />
              </svg>
              <h3 className="text-xl font-semibold text-secondary">신청이 완료됐어요.</h3>
              <p className="text-secondary-light text-sm leading-relaxed">{thankYou}</p>
            </div>
          ) : (
            <form onSubmit={handleSubmit(onSubmit)} noValidate className="flex flex-col gap-5">
              {/* Role toggle */}
              <fieldset>
                <legend className="text-sm font-semibold text-secondary mb-2">
                  {formLabels.role}
                  <span className="text-error ml-1" aria-hidden="true">*</span>
                </legend>
                <div className="grid grid-cols-2 gap-2">
                  {(
                    [
                      { value: "employer" as const, label: formLabels.roleEmployer, icon: "🏪" },
                      { value: "worker" as const, label: formLabels.roleWorker, icon: "👤" },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setValue("role", opt.value, { shouldValidate: true })}
                      className={`flex items-center gap-2 justify-center py-3 px-4 rounded-md border-2 text-sm font-semibold transition-colors ${
                        selectedRole === opt.value
                          ? "bg-primary border-primary text-white"
                          : "bg-white border-[#E2E8F0] text-secondary hover:border-primary/40"
                      }`}
                      aria-pressed={selectedRole === opt.value}
                    >
                      <span aria-hidden="true">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
                {errors.role && (
                  <p role="alert" aria-live="polite" className="text-sm text-error mt-1 flex items-center gap-1">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.role.message}
                  </p>
                )}
              </fieldset>

              {/* Email */}
              <div className="flex flex-col gap-1">
                <label htmlFor="email" className="text-sm font-semibold text-secondary">
                  {formLabels.email}<span className="text-error ml-1" aria-hidden="true">*</span>
                </label>
                <input
                  id="email"
                  type="email"
                  autoComplete="email"
                  placeholder="hello@example.com"
                  aria-invalid={errors.email ? "true" : undefined}
                  aria-describedby={errors.email ? "email-error" : undefined}
                  className={`w-full border rounded-md px-4 py-3 text-base text-secondary bg-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:border-transparent ${errors.email ? "border-error focus:ring-error" : "border-[#E2E8F0] focus:ring-primary"}`}
                  {...register("email")}
                />
                {errors.email && (
                  <p id="email-error" role="alert" aria-live="polite" className="text-sm text-error mt-1 flex items-center gap-1">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.email.message}
                  </p>
                )}
              </div>

              {/* Phone (optional) */}
              <div className="flex flex-col gap-1">
                <label htmlFor="phone" className="text-sm font-semibold text-secondary">
                  {formLabels.phone}
                </label>
                <input
                  id="phone"
                  type="tel"
                  autoComplete="tel"
                  placeholder="010-0000-0000"
                  aria-invalid={errors.phone ? "true" : undefined}
                  aria-describedby={errors.phone ? "phone-error" : undefined}
                  className={`w-full border rounded-md px-4 py-3 text-base text-secondary bg-white placeholder:text-slate-400 transition-colors focus:outline-none focus:ring-2 focus:border-transparent ${errors.phone ? "border-error focus:ring-error" : "border-[#E2E8F0] focus:ring-primary"}`}
                  {...register("phone")}
                />
                {errors.phone && (
                  <p id="phone-error" role="alert" aria-live="polite" className="text-sm text-error mt-1 flex items-center gap-1">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.phone.message}
                  </p>
                )}
              </div>

              {/* Region */}
              <div className="flex flex-col gap-1">
                <label htmlFor="region" className="text-sm font-semibold text-secondary">
                  {formLabels.region}<span className="text-error ml-1" aria-hidden="true">*</span>
                </label>
                <select
                  id="region"
                  aria-invalid={errors.region ? "true" : undefined}
                  aria-describedby={errors.region ? "region-error" : undefined}
                  className={`w-full border rounded-md px-4 py-3 text-base text-secondary bg-white transition-colors focus:outline-none focus:ring-2 focus:border-transparent appearance-none ${errors.region ? "border-error focus:ring-error" : "border-[#E2E8F0] focus:ring-primary"}`}
                  {...register("region")}
                >
                  <option value="">지역을 선택해 주세요</option>
                  {["서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"].map((r) => (
                    <option key={r} value={r}>{r}</option>
                  ))}
                </select>
                {errors.region && (
                  <p id="region-error" role="alert" aria-live="polite" className="text-sm text-error mt-1 flex items-center gap-1">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.region.message}
                  </p>
                )}
              </div>

              {/* Business Number (employer only) */}
              {selectedRole === "employer" && (
                <div className="flex flex-col gap-1">
                  <label htmlFor="businessNumber" className="text-sm font-semibold text-secondary">
                    {formLabels.businessNumber}
                    <span className="text-error ml-1" aria-hidden="true">*</span>
                  </label>
                  <input
                    id="businessNumber"
                    type="text"
                    inputMode="numeric"
                    placeholder={formLabels.businessNumberPlaceholder}
                    aria-invalid={errors.businessNumber ? "true" : undefined}
                    aria-describedby={errors.businessNumber ? "businessNumber-error" : undefined}
                    className={`w-full border rounded-md px-4 py-3 text-base text-secondary bg-white transition-colors focus:outline-none focus:ring-2 focus:border-transparent ${errors.businessNumber ? "border-error focus:ring-error" : "border-[#E2E8F0] focus:ring-primary"}`}
                    {...register("businessNumber")}
                  />
                  {errors.businessNumber && (
                    <p id="businessNumber-error" role="alert" aria-live="polite" className="text-sm text-error mt-1 flex items-center gap-1">
                      <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                        <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                      </svg>
                      {errors.businessNumber.message}
                    </p>
                  )}
                </div>
              )}

              {/* Consent */}
              <div className="flex flex-col gap-1">
                <label className="flex items-start gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    className="mt-0.5 w-4 h-4 accent-primary flex-shrink-0"
                    aria-invalid={errors.consent ? "true" : undefined}
                    aria-describedby={errors.consent ? "consent-error" : undefined}
                    {...register("consent")}
                  />
                  <span className="text-xs text-secondary-light leading-relaxed">
                    {formLabels.consent}
                  </span>
                </label>
                {errors.consent && (
                  <p id="consent-error" role="alert" aria-live="polite" className="text-sm text-error mt-1 flex items-center gap-1">
                    <svg width={14} height={14} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                    </svg>
                    {errors.consent.message}
                  </p>
                )}
              </div>

              {/* API error banner */}
              {submitError && (
                <div
                  role="alert"
                  className="bg-error/10 border border-error/20 rounded-md p-3 text-sm text-error flex gap-2 items-start"
                >
                  <svg width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" className="flex-shrink-0 mt-0.5" aria-hidden="true">
                    <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  {submitError}
                </div>
              )}

              <Button
                type="submit"
                variant="primary"
                size="lg"
                loading={isSubmitting}
                className="w-full mt-1"
              >
                {formLabels.submit}
              </Button>
            </form>
          )}
        </div>
      </div>
    </section>
  )
}
