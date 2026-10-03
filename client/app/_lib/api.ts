/**
 * The only place in the client that calls `fetch`.
 *
 * The session is an httpOnly cookie set by the API on another origin, so every
 * request has to opt into sending it and nothing here can ever read it — who
 * you are comes from `me()`, never from inspecting a token. See 0012.
 *
 * Failures come back as values rather than exceptions. Under `strict` a
 * discriminated union forces every call site to handle the error case, which
 * is what §7 of AGENTS.md asks for: an error state that says what happened and
 * what to do next, rather than a screen that silently renders nothing.
 */

/** Mirrors `toPublicUser` on the server. Adding a field there means adding it here. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  notificationConsent: boolean;
  createdAt: string;
};

/**
 * `details` is keyed by field name and arrives only on a 400 (validation) or a
 * 409 (duplicate email). Everything else — 401, 429, 503, and a failure to
 * reach the server at all — carries a message and nothing more.
 */
export type ApiError = {
  status: number;
  message: string;
  details?: Record<string, string>;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: ApiError };

/**
 * An origin, never an origin plus a prefix: 0009 requires call sites to write
 * `/api/...` themselves, so moving the client and API behind one hostname later
 * is this variable becoming empty and nothing else.
 *
 * Inlined by Next at build time, so a wrong value ships inside the image and a
 * restart will not fix it — see §2 of the deployment checklist.
 */
const PUBLIC_API = process.env.NEXT_PUBLIC_API_URL ?? "";

/**
 * Where a request goes from here. A server component's fetch runs inside the
 * client container, where "localhost" is that container and not the API, so
 * there it uses API_INTERNAL_URL (http://server:8000 on the compose network)
 * when one is set. Read at runtime, not inlined: a restart picks it up.
 */
const API =
  typeof window === "undefined"
    ? (process.env.API_INTERNAL_URL ?? PUBLIC_API)
    : PUBLIC_API;

/** Status 0 is ours, not the network's: no response ever arrived. */
const NO_RESPONSE = 0;

async function readError(response: Response): Promise<ApiError> {
  try {
    const body = await response.json();
    const error = body?.error;

    if (typeof error?.message === "string") {
      return { status: response.status, message: error.message, details: error.details };
    }
  } catch {
    // A proxy timing out returns HTML, and a 502 from anything in front of the
    // API will not be our envelope. Fall through rather than throwing a parse
    // error over the top of the real failure.
  }

  return { status: response.status, message: `Something went wrong (${response.status}).` };
}

async function request<T>(path: string, init: RequestInit = {}): Promise<ApiResult<T>> {
  let response: Response;

  try {
    response = await fetch(`${API}${path}`, {
      ...init,
      // Set once, here. A request that forgets this is anonymous while every
      // other one works, which looks like a server bug and is not.
      credentials: "include",
      headers: {
        // Only when there is a body: sending it on a GET forces a CORS
        // preflight for nothing. It is also the whole CSRF story per 0004, so
        // this must never become form encoding.
        ...(init.body ? { "content-type": "application/json" } : {}),
        ...init.headers,
      },
    });
  } catch {
    // fetch rejects with a TypeError for a dead server, a DNS failure or a
    // rejected CORS preflight — none of which have a status. This is the
    // ordinary state when the API is not running, so it has to render as a
    // sentence rather than as a blank screen.
    return {
      ok: false,
      error: { status: NO_RESPONSE, message: "Cannot reach the server. Is it running?" },
    };
  }

  if (!response.ok) {
    return { ok: false, error: await readError(response) };
  }

  // 204 has no body at all, and calling .json() on it throws.
  if (response.status === 204) {
    return { ok: true, data: undefined as T };
  }

  return { ok: true, data: (await response.json()) as T };
}

type UserResponse = { user: AuthUser };

export function register(body: {
  email: string;
  password: string;
  name: string;
  notificationConsent: boolean;
}) {
  return request<UserResponse>("/api/auth/register", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function login(body: { email: string; password: string }) {
  return request<UserResponse>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export function logout() {
  return request<void>("/api/auth/logout", { method: "POST" });
}

/**
 * The only way to find out whether the cookie is still good. Runs on every page
 * load, which is why the route is deliberately left unlimited server-side.
 *
 * `no-store` because this is the browser's fetch, not Next's patched one — a
 * cached answer here would keep showing a session that logout already ended.
 */
export function me() {
  return request<UserResponse>("/api/auth/me", { cache: "no-store" });
}

/**
 * Where the browser goes to start Google sign-in. A top-level navigation, never
 * a fetch, so always the public origin: a link rendered on the server still
 * ends up in the browser.
 */
export const googleSignInUrl = `${PUBLIC_API}/api/auth/google`;

/* ------------------------------------------------------------------ */
/*  Admin (FR14, FR15)                                                */
/* ------------------------------------------------------------------ */

export type SourceHealth = "ok" | "degraded" | "failed";

export type ScraperSource = {
  id: string;
  name: string;
  portal: string;
  format: string;
  health: SourceHealth;
  /** Uptime over the trailing 30 days. */
  uptime: number;
  lastRun: string;
  docsLast7Days: number;
  /** One bar per day for the last 14 days, oldest first: true = run succeeded. */
  history: boolean[];
  error?: string;
};

export type ReviewItem = {
  docId: string;
  title: string;
  agency: string;
  ingestedAt: string;
  ocr: number;
  extraction: number;
  /** Fields the model itself was unsure about. */
  lowFields: { field: string; value: string; confidence: number }[];
  /** Set when the classifier's IT/non-IT call looks wrong. */
  misclassified?: { predicted: string; likely: string };
};

export type AdminOperations = {
  sources: ScraperSource[];
  reviewQueue: ReviewItem[];
  stats: {
    docsIngestedToday: number;
    docsAwaitingReview: number;
    avgOcrConfidence: number;
    avgExtractionConfidence: number;
    amendmentsDetected7d: number;
  };
};

/**
 * Everything the admin dashboard renders, in one call.
 *
 * This data used to be a module-scope import in the admin page, which put
 * scraper internals, document ids and confidence scores into a public JS chunk
 * — the nav link was hidden, the chunk was not. It comes from the API now, and
 * a non-admin gets a 403 with nothing attached to it. See 0011.
 */
export function adminOperations() {
  return request<AdminOperations>("/api/admin/operations", { cache: "no-store" });
}

/* ------------------------------------------------------------------ */
/*  TOR & Insight (FR-10, FR-11, FR-13, FR-15, FR-16, FR-19, FR-20)   */
/* ------------------------------------------------------------------ */

export type LockSpecFinding = {
  id: string;
  title: string;
  category: string;
  requirementText: string;
  normalBenchmark: string;
  sourceExcerpt: string;
  sourceLocation: string;
  severity: "high" | "medium" | "low";
};

export type ComparableProject = {
  title: string;
  year: number;
  referencePriceTHB: number;
};

/**
 * What the API says about where a TOR summary came from (ADR 0015). In pilot
 * mode the API also returns summaries nobody has checked, and demo data: the
 * page must label both.
 */
export type TorReview = {
  /** "pipeline": real AI output; "demo": made-up seed data for the UI */
  origin: "pipeline" | "demo";
  status: "pending" | "approved" | "rejected";
  /** A person approved this pipeline result. Demo data is never checked. */
  checked: boolean;
  /** 0–100, from the pipeline's checks; null for demo data */
  score: number | null;
  failedChecks: number;
  processedAt: string | null;
};

export type LockSpecAnalysis = {
  riskScore: number;
  verdictText: string;
  findings: LockSpecFinding[];
};

export type PriceAnalysis = {
  referencePriceTHB: number;
  historicalMedianTHB: number;
  diffPercentage: number;
  interpretation: string;
  comparableProjects: ComparableProject[];
};

/**
 * The lifecycle as the public sees it (FR-15). Closed is the platform's
 * inference: past the deadline with no word from the agency (ADR 0013).
 */
export type TorStatus = "Draft" | "Open" | "Awarded" | "Closed" | "Cancelled";

export type TorInsightSummary = {
  projectId: string;
  identification: {
    titleTh: string;
    titleEn: string | null;
    agency: string;
    department: string | null;
    category: string | null;
    status: TorStatus;
  };
  facts: {
    budgetTHB: number | null;
    referencePriceTHB: number | null;
    submissionDeadline: string | null;
    procurementMethod: string | null;
    penaltyClause: string | null;
    postedDate: string | null;
    webUrl: string | null;
  };
  technicalRequirements?: {
    requiredTechnologies: { name: string; version: string | null }[];
  };
  /** null: the analysis hasn't been run, never a measured 0 */
  analytics: {
    lockSpec: { riskScore: number; verdictText: string } | null;
    priceAnalysis: { diffPercentage: number } | null;
  };
  amendmentInfo?: {
    isAmended: boolean;
  };
  /** Only companies may bid ("เฉพาะนิติบุคคล") */
  companiesOnly: boolean;
  review: TorReview;
  createdAt?: string;
};

export type TorInsightDetail = {
  projectId: string;
  identification: {
    titleTh: string;
    titleEn: string | null;
    agency: string;
    department: string | null;
    egpReference: string | null;
    category: string | null;
    status: TorStatus;
  };
  facts: {
    budgetTHB: number | null;
    referencePriceTHB: number | null;
    submissionDeadline: string | null;
    deliveryPeriodDays: number | null;
    procurementMethod: string | null;
    warrantyYears: number | null;
    contractDurationDays: number | null;
    penaltyClause: string | null;
    postedDate: string | null;
    sourceUrl: string | null;
    webUrl: string | null;
  };
  evidence?: Record<string, { quote: string; page: number | null }>;
  overview: {
    objective: string | null;
    majorComponents: string[];
    highLevelScope: string | null;
  };
  deliverables: {
    system: string[];
    implementation: string[];
    validation: string[];
    supportingWork: string[];
  };
  technicalRequirements: {
    requiredTechnologies: { name: string; version: string | null }[];
    requiredCapabilities: string[];
    infrastructureSpecifications: { key: string; spec: string }[];
    technicalConstraints: { metric: string; value: string }[];
  };
  integrationEnvironment: {
    existingSystems: string[];
    interfacesAndApis: string[];
    dataMigrationNotes: string | null;
    deploymentLocation: string | null;
  };
  operationalRequirements: {
    installationAndConfig: string[];
    training: string[];
    technicalSupportAndSla: string | null;
    maintenance: string[];
  };
  eligibility: {
    /** Conditions every e-GP TOR repeats, as keys; matched later, not shown */
    standardConditions?: string[];
    /** Only the conditions specific to this TOR */
    companyRequirements: string[];
    requiredCertifications: string[];
    manufacturerAuthorizations: string[];
    previousExperience: string | null;
    previousExperienceMinTHB: number | null;
    personnelQualifications: string[];
  };
  contractConditions: {
    paymentTerms: string | null;
    deliveryConditions: string | null;
    evaluationMethod: string | null;
  };
  /** null: the analysis hasn't been run, never a measured 0 */
  analytics: {
    lockSpec: LockSpecAnalysis | null;
    priceAnalysis: PriceAnalysis | null;
  };
  amendmentInfo: {
    isAmended: boolean;
    lastAmendedDate: string | null;
    amendmentSummary: string;
    changedSections: string[];
  };
  companiesOnly: boolean;
  review: TorReview;
  document?: {
    fileName: string | null;
    sizeBytes: number | null;
    pages: number | null;
    documentType: string | null;
  } | null;
  source?: string | null;
};

export type TorListResponse = {
  tors: TorInsightSummary[];
  total: number;
  page: number;
  pages: number;
  limit: number;
};

/**
 * The catalog's filters (FR-11). A list matches any one of its values, and is
 * sent as a repeated key, so a value may contain a comma.
 */
export type TorListParams = {
  q?: string;
  status?: TorStatus[];
  /** Only TORs the agency has amended */
  amended?: boolean;
  minBudget?: number;
  maxBudget?: number;
  tech?: string[];
  agency?: string[];
  /** Still open, and closing within this many days */
  closingWithin?: number;
  excludeHighRisk?: boolean;
  sort?: "newest" | "deadline" | "budget-desc" | "budget-asc";
  page?: number;
  limit?: number;
};

export function listTors(params: TorListParams = {}) {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    // Unset filters are left out, never sent as "undefined" or "false"
    if (value === undefined || value === "" || value === false) continue;
    for (const item of Array.isArray(value) ? value : [value]) query.append(key, String(item));
  }
  const qs = query.toString();
  return request<TorListResponse>(`/api/tors${qs ? `?${qs}` : ""}`, { cache: "no-store" });
}

export type FacetCount = { name: string; count: number };

/** What the catalog's filters can offer, counted over everything public. */
export type TorFacets = {
  total: number;
  lastUpdated: string | null;
  statuses: Record<TorStatus, number>;
  amended: number;
  /** The most common, not every one */
  agencies: FacetCount[];
  technologies: FacetCount[];
};

export function torFacets() {
  return request<TorFacets>("/api/tors/facets", { cache: "no-store" });
}

export function getTorInsight(projectId: string) {
  return request<TorInsightDetail>(`/api/tors/${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
}
