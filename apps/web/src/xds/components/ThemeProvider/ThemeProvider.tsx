"use client";

import type * as React from "react";
/**
 * ThemeProvider — xds 브랜드(data-brand)·다크 모드(.dark)를 documentElement에 적용하는
 * 상태 provider. DOM을 렌더하지 않고 children만 반환한다.
 *
 * - mode: "light" | "dark" | "system" — localStorage("xds-theme-mode")에 유지,
 *   "system"이면 prefers-color-scheme을 따라가고 변경도 실시간 반영.
 * - brand: "jk" | "am" | "jp" — 런타임 전환 가능. 서브트리 단위 브랜드가 필요하면
 *   provider 대신 해당 요소에 data-brand를 직접 걸면 된다(속성 셀렉터 상속).
 * - SSR 주의: 저장된 모드는 마운트 후 적용되므로 첫 페인트 플래시를 피하려면
 *   layout의 <html>에 suppressHydrationWarning을 두는 것을 권장.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type ThemeBrand = "jk" | "am" | "jp";
export type ThemeMode = "light" | "dark" | "system";

const STORAGE_KEY = "xds-theme-mode";

interface ThemeContextValue {
  brand: ThemeBrand;
  setBrand: (brand: ThemeBrand) => void;
  mode: ThemeMode;
  setMode: (mode: ThemeMode) => void;
  /** "system"이 해소된 실제 표시 모드 */
  resolvedMode: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function systemPrefersDark(): boolean {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export interface ThemeProviderProps {
  defaultBrand?: ThemeBrand;
  defaultMode?: ThemeMode;
  children: React.ReactNode;
}

export function ThemeProvider({
  defaultBrand = "jk",
  defaultMode = "system",
  children,
}: ThemeProviderProps) {
  const [brand, setBrand] = useState<ThemeBrand>(defaultBrand);
  const [mode, setModeState] = useState<ThemeMode>(defaultMode);
  const [resolvedMode, setResolvedMode] = useState<"light" | "dark">("light");

  // 저장된 모드 복원 (마운트 후 — SSR 불일치 방지)
  useEffect(() => {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setModeState(stored);
    }
  }, []);

  const setMode = useCallback((next: ThemeMode) => {
    setModeState(next);
    window.localStorage.setItem(STORAGE_KEY, next);
  }, []);

  // documentElement에 브랜드·모드 적용 + system 변경 실시간 추적
  useEffect(() => {
    document.documentElement.dataset.brand = brand;
  }, [brand]);

  useEffect(() => {
    const apply = () => {
      const dark = mode === "dark" || (mode === "system" && systemPrefersDark());
      document.documentElement.classList.toggle("dark", dark);
      setResolvedMode(dark ? "dark" : "light");
    };
    apply();
    if (mode !== "system") return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    media.addEventListener("change", apply);
    return () => media.removeEventListener("change", apply);
  }, [mode]);

  const value = useMemo(
    () => ({ brand, setBrand, mode, setMode, resolvedMode }),
    [brand, mode, setMode, resolvedMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** ThemeProvider 하위에서 브랜드·모드 상태에 접근하는 hook */
export function useTheme(): ThemeContextValue {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme은 <ThemeProvider> 하위에서만 사용할 수 있습니다");
  }
  return context;
}
