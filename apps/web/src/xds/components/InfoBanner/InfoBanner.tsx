/**
 * InfoBanner — Visual 유형 / L1 Atom. AGENTS.md §0 분류 + §7.1 레이어.
 *
 * 지면 흐름 *안에* 상주하는 인라인 안내 배너. 오버레이가 아니다.
 * 형제 컴포넌트와의 경계:
 *
 * | 축 | InfoBanner | Snackbar | Toast | Alert |
 * |---|---|---|---|---|
 * | 위치 | 지면 인라인 | 플로팅 카드 | 플로팅 pill | 모달 |
 * | 수명 | 상주 | action까지 | 4s auto | confirm까지 |
 * | 표면 | tone별 subtle 배경 | layer-default + shadow | surface-inverse | layer-default |
 * | 인터랙션 | 없음 (link만 옵션) | icon button | text button | confirm/cancel |
 *
 * ## API 형태
 *
 * ```tsx
 * <InfoBanner variant="highlight" title="타이틀 메세지" />
 *
 * <InfoBanner
 *   variant="negative"
 *   title="타이틀 메세지"
 *   description="디스크립션 메세지"
 *   linkText="자세히 보기"
 *   linkHref="/help"
 * />
 * ```
 *
 * ## InfoBanner 한정 결정
 *
 * 1. **Visual 유형 — 상태 없음** — Figma 시안에 hover/pressed/focused/disabled 축이 전혀 없다.
 *    루트는 클릭 대상이 아니므로 §5.1 `::after` hover 오버레이를 넣지 않는다.
 *    유일한 인터랙티브 요소는 옵션 `linkText`뿐.
 *
 * 2. **`icon`은 표시/숨김 boolean — 글리프는 `IconInfo` 고정** — Figma `icon: BOOLEAN`을 1:1로 옮김.
 *    ReactNode 슬롯을 노출하지 않는다: 배너의 아이콘은 **디자인상 info 글리프로 못박혀 있고
 *    교체 대상이 아니다**(메인테이너 확정). 슬롯을 열어두면 호출처마다 다른 글리프가 섞여
 *    시안 정합이 깨진다.
 *    - `icon` 생략 / `icon` → `IconInfo` 렌더 (기본 true)
 *    - `icon={false}` → 아이콘 영역 **자체를 미렌더** (wrapper까지 제거해 gap-1도 함께 소거)
 *
 * 3. **3번째 tone 이름은 `negative`** — 토큰 계열(`danger`)이 아니라 *톤의 의도*를 따른다.
 *    이 variant가 집는 토큰은 `fill-element-danger-subtle` / `icon-danger` /
 *    `typography-error`지만, 레드는 **주의를 끄는 강조 수단**일 뿐 위험(danger)을 신고하는
 *    의미가 아니다. 그래서 `danger`로 이름 붙이면 컴포넌트가 실어야 할 의미를 넘어선다.
 *    Figma 원본 variant명은 `warning`이었으나, 실제 색이 warning 계열(`icon-warning` 등이
 *    별도 존재)이 아니라 danger 계열이어서 이름이 더 헷갈렸다 — 메인테이너 결정으로 `negative` 채택.
 *
 *    글리프는 3종 모두 동일한 info(원 안 i)다. Figma 변수 바인딩 + 스크린샷 픽셀 양쪽에서
 *    확인된 값이며, 아이콘 교체 경로가 없는 것(#2)과도 일관된다.
 *
 * 4. **link는 href/onClick에 따라 요소가 갈림** — 시안에 인터랙션 스펙이 없어 호출자 자유도 우선.
 *    - `linkHref` 있음 → `<a href>`
 *    - `onLinkClick`만 있음 → `<button type="button">`
 *    - 둘 다 없음 → 비대화형 `<span>` (밑줄 스타일만. 링크 시늉만 하는 tabbable 요소를 만들지 않음)
 *    앞의 둘은 §5.2 focus-visible 링 부착 — 키보드 접근성상 필수.
 *
 * 5. **description / link는 variant와 무관하게 `typography-secondary`** — 시안 3종 공통.
 *    tone 분기는 배경·타이틀·아이콘 3곳에만 걸린다.
 *
 * ## 구조
 *
 * ```
 * InfoBanner (w-full, flex-row, items-start, gap-1, px-4 py-3, rounded-brand-sm, tone 배경)
 * ├── icon wrapper?  (py-05로 20px 라인 높이에 16px 아이콘 광학 정렬. icon={false}면 미렌더)
 * │   └── IconInfo   (size-4 고정 글리프, tone별 icon-* 강제)
 * └── content (flex-1, min-w-0, flex-col, gap-1)
 *     ├── title        — 14/20 medium, tone별 색
 *     ├── description? — 13/20 regular, typography-secondary
 *     └── link?        — 13/20 regular + underline, typography-secondary
 * ```
 *
 * ## 아이콘 색 (AGENTS §11)
 *
 * `[&_svg]:icon-*`를 **루트가 아니라 icon wrapper의 cva에** 둔다.
 * 루트에 두면 specificity(0,1,1)가 호출자의 인라인 override(0,1,0)를 이겨버려
 * 외부에서 아이콘 색을 못 바꾸게 되는 §11 금지 패턴이 된다. wrapper는 자기 직속 SVG만
 * 관할하므로 안전하다.
 *
 * 글리프가 `IconInfo` 고정이라 호출처가 아이콘을 주입할 경로 자체가 없고, 색도 variant가
 * 전담한다. 즉 아이콘 시각은 전적으로 이 컴포넌트 소유다. 만약 tone 밖 색이 필요해지면
 * `[&_[data-slot=info-banner-icon]_svg]:icon-brand`(0,2,1)가 유일한 확정 override 경로이나,
 * 그런 요구가 생기면 먼저 variant 추가를 검토할 것.
 *
 * ## Typography (Figma px → 시맨틱 토큰)
 *
 * - title: 14/20 medium → `text-body-xs font-medium`
 * - description / link: 13/20 regular → `text-caption-lg font-normal`
 *
 * 두 토큰 모두 preset composite의 canonical line-height가 20px이라 `leading-*` 명시 없음.
 *
 * ## Width / 멀티라인
 *
 * `w-full` — 부모 폭을 채운다. Figma 인스턴스의 335px은 375 아트보드 − 좌우 20 마진의
 * 결과값이지 컴포넌트 고유 폭이 아니다. 폭 제약이 필요하면 호출자가 className으로 준다.
 * 텍스트 3종 모두 `break-words` — 공백 없는 장문(URL 등)이 배너 밖으로 넘치지 않게.
 * 루트가 `items-start`라 여러 줄이 되어도 아이콘은 첫 줄에 고정된다.
 */

import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { IconInfo } from "@/xds/icons/IconInfo";
import { cn } from "@/xds/lib/utils";

// ─── root ─────────────────────────────────────────────────────────────────
//
// Figma 정합:
//  - padding: px unit-16(16) / py spacing-3(12)
//  - gap: spacing-1 (4)
//  - radius: brand-sm (브랜드 swap — JK/AM 8px)
//  - 배경: variant별 fill-element-*
const rootVariants = cva(cn("flex w-full items-start gap-1 px-4 py-3", "rounded-brand-sm"), {
  variants: {
    variant: {
      basic: "bg-fill-element-surface",
      highlight: "bg-fill-element-info-subtle",
      negative: "bg-fill-element-danger-subtle",
    },
  },
  defaultVariants: { variant: "basic" },
});

// ─── icon wrapper ─────────────────────────────────────────────────────────
//
// py-0.5(2px) — 16px 아이콘을 20px 타이틀 라인 높이 한가운데에 광학 정렬.
// 아이콘 색은 여기서만 강제 (§11 — 루트 cva 금지).
const iconWrapperVariants = cva(cn("flex shrink-0 items-center py-0.5", "[&_svg]:size-4"), {
  variants: {
    variant: {
      basic: "[&_svg]:icon-inverse",
      highlight: "[&_svg]:icon-info",
      negative: "[&_svg]:icon-danger",
    },
  },
  defaultVariants: { variant: "basic" },
});

// ─── title ────────────────────────────────────────────────────────────────
const titleVariants = cva(cn("break-words text-body-xs font-medium"), {
  variants: {
    variant: {
      basic: "text-typography-default",
      highlight: "text-typography-info",
      negative: "text-typography-error",
    },
  },
  defaultVariants: { variant: "basic" },
});

// description / link — variant 무관 공통이라 cva 분기 없음.
const descriptionClasses = cn("break-words text-caption-lg font-normal text-typography-secondary");

const linkClasses = cn(
  "break-words text-caption-lg font-normal text-typography-secondary underline",
  // 자기 자신이 소유하는 좌측 정렬 (flex-col 안에서 텍스트 폭만 차지)
  "self-start text-left",
);

// §5.2 기반 focus-visible 링 — 대화형(a/button)일 때만 부착.
// 표준 문자열은 `ring-offset-2`지만 인라인 텍스트 링크라 offset만 1로 축소
// (Search.tsx / Snackbar.tsx의 인라인 요소와 동일 선례).
const linkFocusClasses = cn(
  "rounded-brand-sm focus-visible:outline-none focus-visible:ring-2",
  "focus-visible:ring-brand-500 focus-visible:ring-offset-1",
);

export type InfoBannerVariants = VariantProps<typeof rootVariants>;

export interface InfoBannerProps
  extends Omit<React.ComponentProps<"div">, "title">,
    InfoBannerVariants {
  /** 타이틀 (필수). 배너의 핵심 메시지 한 줄. */
  title: string;
  /** 디스크립션 (선택). 타이틀 아래 보조 설명. */
  description?: string;
  /**
   * 좌측 아이콘 표시 여부 (기본 `true`).
   * 글리프는 `IconInfo` 고정 — 교체 불가(디자인 확정). `false`면 아이콘 영역 자체를 미렌더.
   * 색은 variant에 따라 wrapper가 강제한다.
   */
  icon?: boolean;
  /** 링크 문구 (선택). 없으면 링크 줄 자체가 렌더되지 않는다. */
  linkText?: string;
  /** 링크 목적지. 주면 `<a href>`로 렌더. */
  linkHref?: string;
  /** 링크 클릭 핸들러. `linkHref` 없이 이것만 주면 `<button type="button">`으로 렌더. */
  onLinkClick?: () => void;
}

/**
 * 지면 인라인 안내 배너. tone 3종(basic / highlight / negative).
 *
 * 상태(hover 등)를 갖지 않는 Visual 컴포넌트이며, 옵션 `linkText`만 대화형이다.
 */
export function InfoBanner({
  variant,
  title,
  description,
  icon = true,
  linkText,
  linkHref,
  onLinkClick,
  className,
  ...props
}: InfoBannerProps) {
  return (
    <div
      data-slot="info-banner"
      data-variant={variant ?? "basic"}
      className={cn(rootVariants({ variant }), className)}
      {...props}
    >
      {icon ? (
        <span data-slot="info-banner-icon" className={cn(iconWrapperVariants({ variant }))}>
          <IconInfo />
        </span>
      ) : null}
      <div data-slot="info-banner-content" className="flex min-w-0 flex-1 flex-col gap-1">
        <span data-slot="info-banner-title" className={cn(titleVariants({ variant }))}>
          {title}
        </span>
        {description ? (
          <span data-slot="info-banner-description" className={descriptionClasses}>
            {description}
          </span>
        ) : null}
        {linkText ? (
          <InfoBannerLink href={linkHref} onClick={onLinkClick}>
            {linkText}
          </InfoBannerLink>
        ) : null}
      </div>
    </div>
  );
}

/**
 * 링크 줄 — href/onClick 유무로 요소가 갈린다 (InfoBanner 한정 결정 #4).
 * 목적지도 핸들러도 없으면 tabbable하지 않은 `<span>`으로 떨어뜨린다.
 */
function InfoBannerLink({
  href,
  onClick,
  children,
}: {
  href?: string;
  onClick?: () => void;
  children: string;
}) {
  if (href) {
    return (
      <a
        data-slot="info-banner-link"
        href={href}
        onClick={onClick}
        className={cn(linkClasses, linkFocusClasses)}
      >
        {children}
      </a>
    );
  }
  if (onClick) {
    return (
      <button
        data-slot="info-banner-link"
        type="button"
        onClick={onClick}
        className={cn(linkClasses, linkFocusClasses)}
      >
        {children}
      </button>
    );
  }
  return (
    <span data-slot="info-banner-link" className={linkClasses}>
      {children}
    </span>
  );
}

InfoBanner.variants = rootVariants;
