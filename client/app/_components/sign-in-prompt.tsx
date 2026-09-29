"use client";

import Link from "next/link";
import { btn, EmptyState } from "./ui";

/**
 * What a guest gets in place of a page that needs an account.
 *
 * An inline prompt rather than a redirect, deliberately. A redirect cannot fire
 * until /me answers, so it arrives after the page chrome has already painted —
 * a flash and then a navigation — and Back from the sign-in form lands on the
 * page that bounces again. Keeping the URL also means a shared link to
 * /watchlist still means /watchlist once you are in.
 *
 * Per §7 of AGENTS.md this says what happened and what to do next, in the
 * product's voice. Each caller supplies its own copy, because "sign in to
 * continue" is exactly the generic non-answer that rule exists to prevent.
 */
export function SignInPrompt({
  headline,
  body,
  next,
  cta,
}: {
  headline: string;
  body: string;
  next: string;
  cta: string;
}) {
  return (
    <EmptyState
      headline={headline}
      body={body}
      action={
        <Link href={`/auth?next=${encodeURIComponent(next)}`} className={btn.primary}>
          {cta}
        </Link>
      }
    />
  );
}
