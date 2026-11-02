import { DEFAULT_STATUSES, STATUSES } from "../../../_lib/catalog";
import type { TorStatus } from "../../../_lib/api";
import {
  BUDGET_BANDS,
  DEADLINE_BANDS,
  SCORE_FLOORS,
  SORTS,
  type FilterState,
  type MatchState,
  type Mode,
  type SearchParamReader,
  type Sort,
} from "./types";

export function parseMode(sp: SearchParamReader): Mode {
  return sp.get("mode") === "match" ? "match" : "filter";
}

export function parseFilterParams(sp: SearchParamReader): FilterState {
  const query = sp.get("q") ?? "";

  const sortParam = sp.get("sort");
  const sort: Sort =
    sortParam && SORTS.some((s) => s.id === sortParam)
      ? (sortParam as Sort)
      : "newest";

  const bParam = sp.get("budget");
  const budgetBand = BUDGET_BANDS.some((b) => b.id === bParam) ? (bParam as string) : "any";

  const dParam = sp.get("deadline");
  const deadlineBand = DEADLINE_BANDS.some((d) => d.id === dParam) ? (dParam as string) : "any";

  const rawTech = sp.getAll("tech");
  const techFilter = Array.from(
    new Set(rawTech.flatMap((t) => t.split(",")).map((s) => s.trim()).filter(Boolean)),
  );

  const rawAgency = sp.getAll("agency");
  const agencyFilter = Array.from(
    new Set(rawAgency.flatMap((a) => a.split(",")).map((s) => s.trim()).filter(Boolean)),
  );

  let statuses: TorStatus[] = DEFAULT_STATUSES;
  if (sp.has("status")) {
    const rawStatus = sp
      .getAll("status")
      .flatMap((s) => s.split(","))
      .map((s) => s.trim());
    if (rawStatus.length === 1 && rawStatus[0] === "none") {
      statuses = [];
    } else {
      const valid = rawStatus.filter((s): s is TorStatus => STATUSES.includes(s as TorStatus));
      statuses = valid.length > 0 ? valid : DEFAULT_STATUSES;
    }
  }

  const amendedOnly = sp.get("amended") === "true";
  const hideHighRisk = sp.get("hideRisk") === "true";

  return {
    query,
    statuses,
    amendedOnly,
    techFilter,
    agencyFilter,
    budgetBand,
    deadlineBand,
    hideHighRisk,
    sort,
  };
}

export function parseMatchParams(sp: SearchParamReader): MatchState {
  const floorParam = Number(sp.get("scoreFloor"));
  const scoreFloor = SCORE_FLOORS.some((f) => f.id === floorParam) ? floorParam : 0;
  const hideClosed = sp.get("hideClosed") === "false" ? false : true;
  const hideHighRisk = sp.get("hideRisk") === "true";

  return {
    scoreFloor,
    hideClosed,
    hideHighRisk,
  };
}

export function buildFilterQueryString(filters: FilterState): string {
  const p = new URLSearchParams();

  const trimmedQ = filters.query.trim();
  if (trimmedQ) {
    p.set("q", trimmedQ);
  }

  if (filters.sort !== "newest") {
    p.set("sort", filters.sort);
  }

  if (filters.budgetBand !== "any") {
    p.set("budget", filters.budgetBand);
  }

  if (filters.deadlineBand !== "any") {
    p.set("deadline", filters.deadlineBand);
  }

  for (const t of filters.techFilter) {
    p.append("tech", t);
  }

  for (const a of filters.agencyFilter) {
    p.append("agency", a);
  }

  const isDefaultStatuses =
    filters.statuses.length === DEFAULT_STATUSES.length &&
    DEFAULT_STATUSES.every((s) => filters.statuses.includes(s));
  if (!isDefaultStatuses) {
    if (filters.statuses.length === 0) {
      p.set("status", "none");
    } else {
      for (const s of filters.statuses) {
        p.append("status", s);
      }
    }
  }

  if (filters.amendedOnly) {
    p.set("amended", "true");
  }

  if (filters.hideHighRisk) {
    p.set("hideRisk", "true");
  }

  const qs = p.toString();
  return qs ? `?${qs}` : "";
}

export function buildMatchQueryString(match: MatchState): string {
  const p = new URLSearchParams();
  p.set("mode", "match");

  if (match.scoreFloor > 0) {
    p.set("scoreFloor", String(match.scoreFloor));
  }

  if (!match.hideClosed) {
    p.set("hideClosed", "false");
  }

  if (match.hideHighRisk) {
    p.set("hideRisk", "true");
  }

  const qs = p.toString();
  return `?${qs}`;
}

export function syncUrlToBrowser(qs: string): void {
  if (typeof window === "undefined") return;
  const currentQs = window.location.search;
  const newUrl = `${window.location.pathname}${qs}${window.location.hash}`;
  if (qs !== currentQs) {
    window.history.replaceState(null, "", newUrl);
  }
  try {
    sessionStorage.setItem("gipdp_last_search_url", newUrl);
  } catch {}
}

export function saveLastSearchUrl(): void {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(
      "gipdp_last_search_url",
      `${window.location.pathname}${window.location.search}${window.location.hash}`
    );
  } catch {}
}

