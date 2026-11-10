import type { TorStatus } from "./api";
import type { Breakpoint } from "./breakpoints";

/** Every status, in the order the catalog's filter lists them. */
export const STATUSES: TorStatus[] = ["Draft", "Open", "Awarded", "Closed", "Cancelled"];

/**
 * Where the catalog starts: what someone can still bid on, or soon. Past
 * projects (awarded, many from data.go.th) and closed or cancelled ones are a
 * click away under Status.
 */
export const DEFAULT_STATUSES: TorStatus[] = ["Draft", "Open"];

/** How many statuses differ from the default: ticked that it leaves out, or left out that it ticks. */
export function statusChanges(statuses: TorStatus[]): number {
  return STATUSES.filter((status) => statuses.includes(status) !== DEFAULT_STATUSES.includes(status)).length;
}

/** No status ticked filters on nothing: the same as every status ticked. */
export function showsEveryStatus(statuses: TorStatus[]): boolean {
  return statuses.length === 0 || STATUSES.every((status) => statuses.includes(status));
}

/**
 * Sorts technologies so that matching user skills appear first at the front of the list,
 * followed by the remaining required technologies, preserving relative order.
 */
export function prioritizeMatchedTech(techs: string[], matchedSkills?: string[]): string[] {
  if (!matchedSkills || matchedSkills.length === 0) return techs;
  const matchedSet = new Set(matchedSkills);
  return [...techs].sort((a, b) => {
    const aMatched = matchedSet.has(a);
    const bMatched = matchedSet.has(b);
    if (aMatched && !bMatched) return -1;
    if (!aMatched && bMatched) return 1;
    return 0;
  });
}

/**
 * Sorts an array of technology objects (such as `{ name: string; version?: string }`)
 * so that technologies matching user skills appear first at the front of the list,
 * preserving original relative order for the rest.
 */
export function prioritizeMatchedTechObjects<T extends { name: string }>(
  items: T[],
  matchedSkills?: string[],
): T[] {
  if (!matchedSkills || matchedSkills.length === 0) return items;
  const matchedSet = new Set(matchedSkills);
  return [...items].sort((a, b) => {
    const aMatched = matchedSet.has(a.name);
    const bMatched = matchedSet.has(b.name);
    if (aMatched && !bMatched) return -1;
    if (!aMatched && bMatched) return 1;
    return 0;
  });
}

export const BREAKPOINT_TECH_BUDGET: Record<Breakpoint, { maxChars: number; maxCount: number }> = {
  mobile: { maxChars: 36, maxCount: 2 },
  tablet: { maxChars: 56, maxCount: 4 },
  desktop: { maxChars: 80, maxCount: 6 },
};

/**
 * Adaptively determines visible tech tags for the card footer.
 * Supports responsive viewport breakpoints ('mobile' | 'tablet' | 'desktop') or custom numbers.
 * Shows up to 6–7 tags on desktop, budgets characters (~80 chars) to prevent
 * layout clipping, and avoids showing a lone "+1" badge when the final tag can fit.
 */
export function getVisibleTechnologies(
  techs: string[],
  breakpointOrMaxChars: Breakpoint | number = "desktop",
  maxCountOverride?: number,
): { visibleTech: string[]; restTech: number } {
  let maxChars = 80;
  let maxCount = 6;

  if (typeof breakpointOrMaxChars === "string") {
    const budget = BREAKPOINT_TECH_BUDGET[breakpointOrMaxChars] ?? BREAKPOINT_TECH_BUDGET.desktop;
    maxChars = budget.maxChars;
    maxCount = maxCountOverride ?? budget.maxCount;
  } else if (typeof breakpointOrMaxChars === "number") {
    maxChars = breakpointOrMaxChars;
    maxCount = maxCountOverride ?? 6;
  }

  const visibleTech: string[] = [];
  let totalChars = 0;

  const minAllowedBeforeBreak =
    typeof breakpointOrMaxChars === "string" && breakpointOrMaxChars === "mobile" ? 1 : 2;

  for (const t of techs) {
    if (visibleTech.length >= maxCount) break;
    if (visibleTech.length >= minAllowedBeforeBreak && totalChars + t.length > maxChars) break;
    visibleTech.push(t);
    totalChars += t.length;
  }

  // If exactly 1 item remains and it fits reasonably, include it rather than showing a redundant "+1" badge
  if (techs.length === visibleTech.length + 1) {
    const lastItem = techs[visibleTech.length];
    if (totalChars + lastItem.length <= maxChars + 15) {
      visibleTech.push(lastItem);
    }
  }

  return {
    visibleTech,
    restTech: techs.length - visibleTech.length,
  };
}
