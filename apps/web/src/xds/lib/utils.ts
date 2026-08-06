import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

/**
 * xds typography utility를 tailwind-merge에 명시적으로 등록.
 *
 * Tailwind가 우리 `--text-body-sm` 같은 토큰으로부터 `text-body-sm` utility를 생성하는데,
 * 이게 color 그룹의 `text-typography-subtle` 같은 클래스와 *같은 접두사 `text-*`*를 공유.
 * 기본 tailwind-merge는 둘을 같은 그룹(font-size)으로 보고 머지하면서 color 클래스를 제거하는 버그가 발생.
 * → 새 typography utility를 font-size 그룹에 명시적으로 등록해 color 그룹과 분리.
 */
const customTwMerge = extendTailwindMerge<"icon-color">({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "body-xs",
            "body-sm",
            "body-base",
            "body-lg",
            "caption-base",
            "caption-lg",
            "heading-xs",
            "heading-sm",
            "heading-base",
            "heading-lg",
            "heading-xl",
          ],
        },
      ],
      // 아이콘 색 utility (preset plugin이 생성, prefix 없는 단일 컨벤션)
      // 같은 그룹으로 인식해야 cn("icon-brand", "icon-default") → "icon-default" (last wins).
      "icon-color": [
        "icon-default",
        "icon-subtle",
        "icon-disabled",
        "icon-inverse",
        "icon-on-color",
        "icon-static-white",
        "icon-brand",
        "icon-info",
        "icon-success",
        "icon-warning",
        "icon-danger",
        "icon-accent-violet",
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return customTwMerge(clsx(inputs));
}
