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

/** FR-12. Stored server-side and returned inside every AuthUser. */
export type UserProfile = {
  skills: string[];
  budgetMin: number;
  budgetMax: number;
  certifications: string[];
};

/** Mirrors `toPublicUser` on the server. Adding a field there means adding it here. */
export type AuthUser = {
  id: string;
  email: string;
  name: string;
  role: "user" | "admin";
  notificationConsent: boolean;
  profile: UserProfile;
  watchlist: string[];
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
 * FR-12. Saves profile preferences. PATCH, so only the fields sent are updated.
 * Returns the full updated user — the caller replaces its AuthUser with this.
 */
export function updateProfile(body: Partial<UserProfile>) {
  return request<UserResponse>("/api/profile", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
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
  /** One bar per run for the last 14 runs, oldest first: true = run succeeded, false = failed, null = no run recorded yet. */
  history: (boolean | null)[];
  error?: string;
};

export type IngestionExecutionLog = {
  id: string;
  source: string;
  status: "ok" | "degraded" | "failed";
  startedAt: string;
  durationMs: number;
  itemsDiscovered: number;
  itemsIngested: number;
  error?: string | null;
};

export type ReviewItemDeliverables = {
  system?: string[];
  implementation?: string[];
  validation?: string[];
  supportingWork?: string[];
};

export type ReviewItemTech = {
  name: string;
  version?: string;
};

export type ReviewItemInfraSpec = {
  item: string;
  specification: string;
};

export type ReviewItemConstraint = {
  metric: string;
  value: string;
};

export type ReviewItemIntegration = {
  existingSystems?: string[];
  interfacesAndApis?: string[];
  dataMigrationNotes?: string | null;
  deploymentLocation?: string | null;
};

export type ReviewItemOperations = {
  installationAndConfig?: string[];
  training?: string[];
  technicalSupportAndSla?: string | null;
  maintenance?: string[];
};

export type ReviewItemAmendment = {
  isAmended?: boolean;
  amendmentSummary?: string;
  changedSections?: string[];
};

export type ReviewItemDetails = {
  // 1. Identification
  titleEn?: string | null;
  department?: string | null;
  category?: string | null;
  status?: string | null;

  // 2. Key Facts
  budgetTHB?: number | null;
  referencePriceTHB?: number | null;
  submissionDeadline?: string | null;
  commentDeadline?: string | null;
  deliveryPeriodDays?: number | null;
  procurementMethod?: string | null;
  contractDurationDays?: number | null;
  warrantyYears?: number | null;
  penaltyClause?: string | null;
  postedDate?: string | null;

  // 3. Project Overview
  objective?: string | null;
  systemArchetype?: string | null;
  complexityTier?: string | null;
  majorComponents?: string[];
  highLevelScope?: string | null;

  // 4. Deliverables
  deliverables?: ReviewItemDeliverables;

  // 5. Technical Requirements
  requiredTechnologies?: string;
  technologiesList?: ReviewItemTech[];
  requiredCapabilities?: string[];
  infrastructureSpecifications?: ReviewItemInfraSpec[];
  technicalConstraints?: ReviewItemConstraint[];

  // 6. Integration Environment
  integrationEnvironment?: ReviewItemIntegration;

  // 7. Operational Requirements
  operationalRequirements?: ReviewItemOperations;

  // 8. Eligibility
  companyRequirements?: string[];
  requiredCertifications?: string[];
  manufacturerAuthorizations?: string[];
  personnelQualifications?: string[];
  previousExperience?: string | null;
  previousExperienceMinTHB?: number | null;

  // 9. Contract Conditions
  paymentTerms?: string | null;
  deliveryConditions?: string | null;
  evaluationMethod?: string | null;

  // 10. Amendment Info
  amendmentInfo?: ReviewItemAmendment;

  evidence?: Record<string, unknown>;
  checks?: Array<{ check: string; severity?: string; field?: string; detail?: unknown }>;
  version?: number;
};

export type ReviewItem = {
  docId: string;
  title: string;
  agency: string;
  ingestedAt: string;
  ocr: number | null;
  extraction: number;
  reviewStatus?: "pending" | "approved" | "rejected";
  /** Fields the model itself was unsure about. */
  lowFields: { field: string; value: string; confidence: number }[];
  details?: ReviewItemDetails;
  procurementMethod?: string | null;
  /** Set when the classifier's IT/non-IT call looks wrong. */
  misclassified?: { predicted: string; likely: string };
};

export type PipelineFailureItem = {
  projectId: string;
  projectTitle: string;
  agency: string;
  step: "download" | "ocr" | "extract";
  attempts: number;
  lastError: string;
  lastTransient: boolean;
  firstFailedAt: string;
  lastFailedAt: string;
};

export type PipelineStageSnapshot = {
  stages: Record<string, number>;
  screens: Record<string, number>;
  insights: Record<string, number>;
};

export type PipelineRunStep = {
  name: string;
  exitCode: number | null;
  startedAt: string | null;
  ms: number;
};

export type PipelineRunItem = {
  id: string;
  job: "poll" | "sweep" | "process";
  outcome: "running" | "done" | "timed-out" | "skipped" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  durationMs: number;
  steps: PipelineRunStep[];
  error?: string | null;
};

export type AdminOperations = {
  sources: ScraperSource[];
  reviewQueue: ReviewItem[];
  recentLogs?: IngestionExecutionLog[];
  pipelineFailures?: PipelineFailureItem[];
  stageSnapshot?: PipelineStageSnapshot;
  pipelineRuns?: PipelineRunItem[];
  stats: {
    docsIngestedToday: number;
    totalIndexedTors?: number;
    docsAwaitingReview: number;
    avgOcrConfidence: number;
    avgExtractionConfidence: number;
    amendmentsDetected7d: number;
    requestStreak?: {
      inARow: number;
      limit: number;
      lastAt: string | null;
      cooldownRemainingMs: number;
    };
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

export type UpdateReviewPayload = {
  action: "approve" | "reclassify" | "confirm_classification";
  reclassifyReason?: string;
  fields?: {
    // 1. Identification
    title?: string;
    titleEn?: string | null;
    agency?: string;
    department?: string | null;
    category?: string | null;
    status?: string | null;

    // 2. Key Facts
    budgetTHB?: number | null;
    referencePriceTHB?: number | null;
    submissionDeadline?: string | null;
    commentDeadline?: string | null;
    deliveryPeriodDays?: number | null;
    procurementMethod?: string | null;
    contractDurationDays?: number | null;
    warrantyYears?: number | null;
    penaltyClause?: string | null;
    postedDate?: string | null;

    // 3. Project Overview
    objective?: string | null;
    systemArchetype?: string | null;
    complexityTier?: string | null;
    majorComponents?: string[];
    highLevelScope?: string | null;

    // 4. Deliverables
    deliverables?: ReviewItemDeliverables;

    // 5. Technical Requirements
    requiredTechnologies?: string;
    technologiesList?: ReviewItemTech[];
    requiredCapabilities?: string[];
    infrastructureSpecifications?: ReviewItemInfraSpec[];
    technicalConstraints?: ReviewItemConstraint[];

    // 6. Integration Environment
    integrationEnvironment?: ReviewItemIntegration;

    // 7. Operational Requirements
    operationalRequirements?: ReviewItemOperations;

    // 8. Eligibility
    companyRequirements?: string[] | string;
    requiredCertifications?: string[];
    manufacturerAuthorizations?: string[];
    personnelQualifications?: string[];
    previousExperience?: string | null;
    previousExperienceMinTHB?: number | null;

    // 9. Contract Conditions
    paymentTerms?: string | null;
    deliveryConditions?: string | null;
    evaluationMethod?: string | null;

    // 10. Amendment Info
    amendmentInfo?: ReviewItemAmendment;
  };
};

export type UpdateReviewResult = {
  ok: boolean;
  projectId: string;
  reviewStatus: string;
  reviewedAt?: string;
};

export type ReExtractResult = {
  ok: boolean;
  projectId: string;
  status: string;
};

/**
 * Manually edit extracted data, approve, or reclassify a TOR in the review queue (FR-23).
 */
export function adminUpdateReview(projectId: string, payload: UpdateReviewPayload) {
  return request<UpdateReviewResult>(`/api/admin/review/${encodeURIComponent(projectId)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

export type GetReviewItemResult = {
  ok: boolean;
  item: ReviewItem & {
    budgetTHB?: number | null;
    referencePriceTHB?: number | null;
    submissionDeadline?: string | null;
  };
};

/**
 * Retrieves a single normalized review item for the dedicated review workspace (FR-23).
 */
export function adminGetReviewItem(projectId: string) {
  return request<GetReviewItemResult>(`/api/admin/review/${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
}

/**
 * Re-queue a TOR for AI extraction (FR-23).
 */
export function adminReExtract(projectId: string) {
  return request<ReExtractResult>(`/api/admin/review/${encodeURIComponent(projectId)}/re-extract`, {
    method: "POST",
  });
}

export type TorVersionItem = {
  version: number;
  reason: string;
  supersededAt: string;
  supersededBy?: string | null;
  promptVersion?: string;
  modelName?: string;
  confidenceScore?: number;
  reviewStatus?: string;
  keptText?: boolean;
};

export type ListVersionsResult = {
  projectId: string;
  current: number | null;
  versions: TorVersionItem[];
};

export type RollbackVersionResult = {
  ok: boolean;
  projectId: string;
  restoredVersion: number;
  currentVersion: number;
};

/** Lists past snapshots of a TOR's summary (NFR-07, ADR 0031). */
export function adminGetTorVersions(projectId: string) {
  return request<ListVersionsResult>(`/api/admin/review/${encodeURIComponent(projectId)}/versions`, {
    cache: "no-store",
  });
}

/** Restores an older version of a TOR's summary (NFR-07, ADR 0031). */
export function adminRollbackTorVersion(projectId: string, version: number) {
  return request<RollbackVersionResult>(`/api/admin/review/${encodeURIComponent(projectId)}/rollback`, {
    method: "POST",
    body: JSON.stringify({ version }),
  });
}

export type TriggerIngestResult = {
  ok: boolean;
  fetched: number;
  message: string;
};

/**
 * Triggers an on-demand polling run across procurement sources.
 */
export function adminTriggerIngest(source: string = "all") {
  return request<TriggerIngestResult>("/api/admin/ingest", {
    method: "POST",
    body: JSON.stringify({ source, limit: 2 }),
  });
}

export type CheckSourceHealthResult = {
  ok: boolean;
  message: string;
  results: Record<
    string,
    { status: "ok" | "degraded" | "failed"; latencyMs: number; message: string }
  >;
};

/**
 * Checks connectivity and measures response latency for external sources (FR-22).
 */
export function adminCheckSourceHealth(source: string = "all") {
  return request<CheckSourceHealthResult>("/api/admin/health-check", {
    method: "POST",
    body: JSON.stringify({ source }),
  });
}

export type RetryPipelineStepResult = {
  ok: boolean;
  projectId: string;
  step: string;
  status: string;
  executedImmediately?: boolean;
  message: string;
};

export type RetryAllFailuresResult = {
  ok: boolean;
  clearedCount: number;
  message: string;
};

export type DismissPipelineFailureResult = {
  ok: boolean;
  projectId: string;
  step: string;
  status: string;
  message: string;
};

/**
 * Re-triggers / retries a stuck or failed pipeline step (FR-24).
 * If runNow is true, the step runner is invoked on-demand immediately.
 */
export function adminRetryPipelineStep(projectId: string, step: string, runNow: boolean = false) {
  const payload: { projectId: string; step: string; runNow?: boolean } = { projectId, step };
  if (runNow) {
    payload.runNow = true;
  }
  return request<RetryPipelineStepResult>("/api/admin/pipeline/retry", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Bulk retries all transient or step-specific failures in one click (FR-24).
 */
export function adminRetryAllPipelineFailures(options: { step?: string; transientOnly?: boolean } = {}) {
  return request<RetryAllFailuresResult>("/api/admin/pipeline/retry-all", {
    method: "POST",
    body: JSON.stringify(options),
  });
}

/**
 * Permanently dismisses a failed pipeline step and marks the document excluded (FR-24).
 */
export function adminDismissPipelineFailure(projectId: string, step: string, reason?: string) {
  return request<DismissPipelineFailureResult>("/api/admin/pipeline/dismiss", {
    method: "POST",
    body: JSON.stringify({ projectId, step, reason }),
  });
}

export type PipelineTaskItem = {
  projectId: string;
  title: string;
  agency: string;
  pipelineStatus: string;
  phase: 'download' | 'ocr' | 'extract' | 'extracted' | 'failed';
  step: string;
  lastError: string | null;
  attempts: number;
  lastTransient: boolean;
  updatedAt: string;
};

export type GetPipelineTasksResult = {
  tasks: PipelineTaskItem[];
  total: number;
  page: number;
  limit: number;
  counts: {
    all: number;
    download: number;
    ocr: number;
    extract: number;
    extracted: number;
    failed: number;
  };
};

export type SkipPipelineStepResult = {
  ok: boolean;
  projectId: string;
  step: string;
  nextStatus: string;
  message: string;
};

/**
 * Queries pipeline tasks with filtering by phase (all, download, ocr, extract, extracted, failed) (FR-24).
 */
export function adminGetPipelineTasks(params: {
  phase?: string;
  search?: string;
  page?: number;
  limit?: number;
} = {}) {
  const query = new URLSearchParams();
  if (params.phase) query.set("phase", params.phase);
  if (params.search) query.set("search", params.search);
  if (params.page) query.set("page", String(params.page));
  if (params.limit) query.set("limit", String(params.limit));

  const qs = query.toString();
  return request<GetPipelineTasksResult>(`/api/admin/pipeline/tasks${qs ? `?${qs}` : ""}`);
}

/**
 * Advances a project past a stuck pipeline step (FR-24).
 */
export function adminSkipPipelineStep(projectId: string, step: string) {
  return request<SkipPipelineStepResult>("/api/admin/pipeline/skip", {
    method: "POST",
    body: JSON.stringify({ projectId, step }),
  });
}

export type PipelineStageDetail = {
  done: boolean;
  timestamp?: string | null;
  usedOcr?: boolean;
  confidence?: number | null;
  status?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  error?: string | null;
};

export type PipelineRecordDiagnostics = {
  projectId: string;
  title: string;
  agency: string;
  budgetTHB: number | null;
  referencePriceTHB: number | null;
  submissionDeadline: string | null;
  status: string;
  isAmended: boolean;
  procurementMethod?: string | null;
  wavePriority?: string;
  pipelineStatus: string;
  source: string;
  announceDate: string | null;
  stages: {
    fetched: PipelineStageDetail;
    downloaded: PipelineStageDetail;
    ocr: PipelineStageDetail;
    extracted: PipelineStageDetail;
    reviewed: PipelineStageDetail;
  };
  document?: {
    fileName: string;
    pages: number;
    sizeBytes: number;
    documentType: string;
    sourceUrl?: string;
  } | null;
  ocr?: {
    usedOcr?: boolean;
    confidence?: number | null;
  } | null;
  activeFailure?: {
    step: string;
    attempts: number;
    lastError: string;
    lastTransient: boolean;
    firstFailedAt: string;
    lastFailedAt: string;
  } | null;
  insight?: {
    confidence: number | null;
    reviewStatus: string;
    excluded?: { reason: string; dismissedAt: string } | null;
    extractedTechnologies: string[];
    lockSpecRisk: string;
  } | null;
  titleScreen?: {
    category?: string | null;
    verdict?: string;
    isItRelated?: boolean;
    reason?: string;
    screenedAt?: string;
  } | null;
};

export type GetPipelineRecordResult = {
  ok: boolean;
  record: PipelineRecordDiagnostics;
};

export type AddPipelineRecordResult = {
  ok: boolean;
  projectId: string;
  title: string;
  agency: string;
  status: string;
  pipelineStatus: string;
  message: string;
};

/**
 * Retrieves full lifecycle diagnostics for an individual procurement record (FR-24).
 */
export function adminGetPipelineRecord(projectId: string) {
  return request<GetPipelineRecordResult>(
    `/api/admin/pipeline/record/${encodeURIComponent(projectId.trim())}`,
  );
}

/**
 * Manually adds an 11-digit e-GP project ID and initiates download of its packages (FR-24).
 */
export function adminAddPipelineRecord(projectId: string) {
  return request<AddPipelineRecordResult>("/api/admin/pipeline/add", {
    method: "POST",
    body: JSON.stringify({ projectId: projectId.trim() }),
  });
}

export type SuggestedProject = {
  projectId: string;
  title: string;
  agency: string;
  budgetTHB: number | null;
  status: string;
};

/**
 * Searches projects by partial ID or title for live autocompletion (FR-24).
 */
export function adminSuggestProjects(q: string) {
  return request<SuggestedProject[]>(
    `/api/admin/projects/suggest?q=${encodeURIComponent(q.trim())}`,
  );
}

export type AdminTechnology = {
  id: string;
  name: string;
  key: string;
  category: string | null;
  aliases: string[];
  status: "confirmed" | "new" | "rejected";
  firstSeenIn: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminTechnologiesResponse = {
  items: AdminTechnology[];
  total: number;
  page: number;
  totalPages: number;
  pendingRequestsCount: number;
};

export type CreateAdminTechnologyPayload = {
  name: string;
  category?: string | null;
  aliases?: string[];
  status?: "confirmed" | "new" | "rejected";
};

export type UpdateAdminTechnologyPayload = {
  name?: string;
  category?: string | null;
  aliases?: string[];
  status?: "confirmed" | "new" | "rejected";
};

/**
 * Lists technologies and standards vocabulary for admin directory and review queue.
 */
export function adminGetTechnologies(params?: {
  status?: string;
  search?: string;
  page?: number;
  limit?: number;
}) {
  const query = new URLSearchParams();
  if (params?.status) query.set("status", params.status);
  if (params?.search) query.set("search", params.search);
  if (params?.page) query.set("page", String(params.page));
  if (params?.limit) query.set("limit", String(params.limit));
  const queryString = query.toString() ? `?${query.toString()}` : "";
  return request<AdminTechnologiesResponse>(`/api/admin/technologies${queryString}`, {
    cache: "no-store",
  });
}

/**
 * Creates a new technology or standard entry directly by admin.
 */
export function adminCreateTechnology(payload: CreateAdminTechnologyPayload) {
  return request<AdminTechnology>("/api/admin/technologies", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

/**
 * Updates an existing technology or standard entry (edit, approve, reject).
 */
export function adminUpdateTechnology(id: string, payload: UpdateAdminTechnologyPayload) {
  return request<AdminTechnology>(`/api/admin/technologies/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: JSON.stringify(payload),
  });
}

/**
 * Deletes a technology entry.
 */
export function adminDeleteTechnology(id: string) {
  return request<{ ok: boolean; id: string; message: string }>(
    `/api/admin/technologies/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );
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
  referencePriceTHB: number | null;
  historicalMedianTHB: number | null;
  historicalAverageTHB?: number | null;
  diffAmountTHB?: number | null;
  diffPercentage: number | null;
  diffAverageAmountTHB?: number | null;
  diffAveragePercentage?: number | null;
  sampleSize?: number;
  reliability?: "none" | "low" | "sufficient";
  interpretation: string;
  comparableProjects: ComparableProject[];
};

/**
 * The lifecycle as the public sees it (FR-15). Closed is the platform's
 * inference: past the deadline with no word from the agency (ADR 0013).
 */
export type TorStatus = "Draft" | "Open" | "Awarded" | "Closed" | "Cancelled";

/**
 * e-GP's announcement codes (ADR 0017): 15 reference price, B0 draft TOR,
 * D0 invitation, D2 invitation changed, D1 invitation cancelled, W0 winner,
 * W2 winner changed, W1 winner cancelled.
 */
export type AnnouncementCode = "15" | "B0" | "D0" | "D2" | "D1" | "W0" | "W2" | "W1";

/** The stage e-GP announced last, when the feed announced the TOR at all. */
export type LatestAnnouncement = { code: AnnouncementCode; publishedAt: string | null } | null;

/**
 * Where a change came from (ADR 0032): `feed`, the agency announced it on
 * e-GP (a D2); `package`, the platform found a new package whose contents
 * differ, an inference the page says is one.
 */
export type ChangeSource = "feed" | "package";

/** One thing that changed. Dates are ISO strings and numbers plain ones: the page formats them. */
export type ChangeRow = {
  kind: "added" | "removed" | "changed";
  field: string;
  before: string | null;
  after: string | null;
};

/** A change to the TOR, as the detail page lists it (FR-16). */
export type TorChange = {
  source: ChangeSource;
  /** The stage that changed; null when it couldn't be read */
  stage: "draft" | "invitation" | null;
  /** The summary on the page predates this change: the new document isn't read yet */
  rereadPending: boolean;
  round: string | null;
  /** The date the notice or the documents state; null when neither does */
  date: string | null;
  headline: string | null;
  /** When the platform found it */
  detectedAt: string | null;
  /** The last check before that found nothing new: a found change happened between the two */
  previousCheckAt: string | null;
  /** The e-GP package it came with, and the one it replaced: both originals */
  zipId: string | null;
  previousZipId: string | null;
  /** facts: the announcement's facts compared; complete: the summary too; none: nothing compared */
  diff: "none" | "facts" | "complete";
  changes: ChangeRow[];
};

/** The latest change, for a list row: what the change marker shows. */
export type LatestChange = {
  source: ChangeSource;
  date: string | null;
  detectedAt: string | null;
  previousCheckAt: string | null;
  fields: string[];
} | null;

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
    /** A draft out for public hearing: comments due by this date (extract-v4) */
    commentDeadline?: string | null;
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
  /** When the latest change was found; null when none is known (ADR 0032) */
  lastChangeAt?: string | null;
  latestChange?: LatestChange;
  /** Only companies may bid ("เฉพาะนิติบุคคล") */
  companiesOnly: boolean;
  latestAnnouncement: LatestAnnouncement;
  /** data.go.th has the signed contract */
  contractSigned: boolean;
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
    /** A draft out for public hearing: comments due by this date (extract-v4) */
    commentDeadline?: string | null;
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
  lastChangeAt?: string | null;
  latestChange?: LatestChange;
  /** Each change, oldest first; none rolled back (FR-16, ADR 0032) */
  amendments?: TorChange[];
  companiesOnly: boolean;
  latestAnnouncement: LatestAnnouncement;
  /** data.go.th has the signed contract */
  contractSigned: boolean;
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

export type TechnologyItem = {
  name: string;
  category?: string;
};

export type TechnologiesResponse = {
  technologies: TechnologyItem[];
};

export function getTechnologies() {
  return request<TechnologiesResponse>("/api/technologies", { cache: "no-store" });
}

export type RequestTechnologyPayload = {
  name: string;
  category?: string;
  reason?: string;
};

export type RequestTechnologyResponse = {
  technology: TechnologyItem & { status?: string };
  alreadyExists: boolean;
};

export function requestTechnology(payload: RequestTechnologyPayload) {
  return request<RequestTechnologyResponse>("/api/technologies/request", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}


export function getTorInsight(projectId: string) {
  return request<TorInsightDetail>(`/api/tors/${encodeURIComponent(projectId)}`, {
    cache: "no-store",
  });
}

/**
 * Returns the URL to stream the PDF document preview for a TOR project on demand.
 * The endpoint streams binary PDF directly from memory without saving to DB.
 */
export function getTorPdfPreviewUrl(projectId: string, part = 0, role?: string): string {
  const params = new URLSearchParams();
  if (part > 0) params.set("part", String(part));
  if (role) params.set("role", role);
  const qs = params.toString();
  return `${PUBLIC_API}/api/tors/${encodeURIComponent(projectId)}/preview${qs ? `?${qs}` : ""}`;
}

/* ------------------------------------------------------------------ */
/*  Watchlist (FR-17)                                                 */
/* ------------------------------------------------------------------ */

/** A saved TOR: changed since it was saved when lastChangeAt is later than savedAt (FR-17) */
export type WatchlistItem = TorInsightSummary & { savedAt: string };

export type WatchlistResponse = {
  tors: WatchlistItem[];
  savedIds: string[];
};

export type WatchlistToggleResult = {
  saved: boolean;
  projectId: string;
  count: number;
};

export function getWatchlist() {
  return request<WatchlistResponse>("/api/watchlist", { cache: "no-store" });
}

export function addToWatchlist(projectId: string) {
  return request<WatchlistToggleResult>(`/api/watchlist/${encodeURIComponent(projectId)}`, {
    method: "PUT",
  });
}

export function removeFromWatchlist(projectId: string) {
  return request<WatchlistToggleResult>(`/api/watchlist/${encodeURIComponent(projectId)}`, {
    method: "DELETE",
  });
}

