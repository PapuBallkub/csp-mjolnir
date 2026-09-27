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
const API = process.env.NEXT_PUBLIC_API_URL ?? "";

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

/** Where the browser goes to start Google sign-in. A top-level navigation, never a fetch. */
export const googleSignInUrl = `${API}/api/auth/google`;
