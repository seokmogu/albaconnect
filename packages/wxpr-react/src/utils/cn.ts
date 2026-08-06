export type ClassValue = string | number | undefined | null | false;

/**
 * Tiny classnames joiner. No deduplication — same semantics as `classnames`
 * with array-only input. Kept minimal to avoid an external dep.
 */
export function cn(...args: ClassValue[]): string {
  return args.filter(Boolean).join(" ");
}
