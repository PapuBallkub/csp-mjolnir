"use client";

import { useEffect, useSyncExternalStore } from "react";

// An emailed link carries its token after `#` (0041, 0042), which never leaves
// the browser: no server or proxy log sees it.
const TOKEN_IN_HASH = /(?:^#|&)token=([A-Za-z0-9_-]{43})(?:&|$)/;

// Kept once read, because the page clears the hash right after, and keyed by
// page, so a confirm link's token is never offered to the reset page. A link
// opened later in the same tab brings its own token, which replaces this one.
let held: { path: string; token: string } | null = null;

function readLinkToken() {
  const inHash = TOKEN_IN_HASH.exec(window.location.hash)?.[1];
  if (inHash) held = { path: window.location.pathname, token: inHash };
  return held?.path === window.location.pathname ? held.token : null;
}

const noUpdates = () => () => {};

/**
 * The token of the emailed link that opened this page: undefined on the
 * server, which never sees the hash; null when the link carried none. Once
 * read, the hash leaves the address bar and history. Next integrates
 * replaceState with its router, so that changes nothing else.
 */
export function useLinkToken(): string | null | undefined {
  const token = useSyncExternalStore<string | null | undefined>(noUpdates, readLinkToken, () => undefined);

  useEffect(() => {
    if (token && window.location.hash) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
  }, [token]);

  return token;
}
