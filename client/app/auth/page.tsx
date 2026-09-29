import { AuthForm } from "../_components/auth-form";
import { safeNext } from "../_lib/safe-next";

/**
 * A server component purely so `?next=` is read here rather than with
 * useSearchParams in the form — that hook bails out of prerendering and wants
 * a Suspense boundary around a page that has no reason to need one.
 *
 * Validating before the value reaches any client code is also the point:
 * router.replace() will follow an absolute URL, so an unchecked ?next= turns
 * the sign-in page into an open redirect. See safe-next.ts.
 */
export default async function AuthPage({ searchParams }: PageProps<"/auth">) {
  const { next } = await searchParams;

  // A repeated parameter arrives as an array, which is never something we made.
  return <AuthForm next={safeNext(next)} />;
}
