"use client";

import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import * as api from "../_lib/api";
import type { ApiError, AuthUser } from "../_lib/api";

/**
 * Who is signed in, and the three operations that change that (US4, US5).
 *
 * The session is an httpOnly cookie on the API's origin, so the client cannot
 * read it and cannot know the answer without asking: `GET /api/auth/me` on
 * mount is the only session probe, and Google sign-in gives no other signal —
 * a successful callback lands the browser back on `/` with no parameter at all.
 *
 * Three states, not a nullable user. `loading` is a real answer and a different
 * one from `anonymous`; collapsing them makes the header flash "Sign in" at
 * someone who is signed in, on every page load. See 0012.
 */
export type AuthState =
  | { status: "loading"; user: null }
  | { status: "authenticated"; user: AuthUser }
  | { status: "anonymous"; user: null };

type AuthValue = AuthState & {
  signIn: (input: { email: string; password: string }) => Promise<ApiError | null>;
  signUp: (input: {
    email: string;
    password: string;
    name: string;
    notificationConsent: boolean;
  }) => Promise<ApiError | null>;
  signOut: () => Promise<ApiError | null>;
};

const AuthContext = createContext<AuthValue>({
  status: "loading",
  user: null,
  signIn: async () => null,
  signUp: async () => null,
  signOut: async () => null,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  // Starts at loading, never anonymous: the server prerender and the first
  // client render have to agree, and neither of them knows yet.
  const [state, setState] = useState<AuthState>({ status: "loading", user: null });

  useEffect(() => {
    // StrictMode runs this twice in development. Harmless — /me is deliberately
    // left unlimited server-side because it runs on every page load — but the
    // duplicate in the network tab is not a bug.
    let cancelled = false;

    api.me().then((result) => {
      if (cancelled) return;
      setState(
        result.ok
          ? { status: "authenticated", user: result.data.user }
          : { status: "anonymous", user: null },
      );
    });

    return () => {
      cancelled = true;
    };
  }, []);

  // Each returns the error rather than throwing it, so a form can put the
  // message under the right input and still decide for itself where to go next.
  const signIn: AuthValue["signIn"] = useCallback(async (input) => {
    const result = await api.login(input);
    if (!result.ok) return result.error;
    setState({ status: "authenticated", user: result.data.user });
    return null;
  }, []);

  const signUp: AuthValue["signUp"] = useCallback(async (input) => {
    const result = await api.register(input);
    if (!result.ok) return result.error;
    setState({ status: "authenticated", user: result.data.user });
    return null;
  }, []);

  const signOut: AuthValue["signOut"] = useCallback(async () => {
    const result = await api.logout();

    // A failed logout left the cookie alive, so a reload signs them back in.
    // Say so rather than showing a signed-out header that is not true — the
    // server route is unfailable precisely because of shared machines.
    if (!result.ok) return result.error;

    setState({ status: "anonymous", user: null });
    return null;
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}

/**
 * For pages inside (app)/(private), where the layout has already established
 * that someone is signed in. Saves every one of them repeating a null check
 * the router has made impossible.
 *
 * It throws rather than returning null because reaching it unauthenticated
 * means the page was mounted outside the guard — a routing mistake, which is
 * worth failing loudly in development instead of rendering a blank panel.
 */
export function useAuthedUser() {
  const { user } = useAuth();

  if (!user) {
    throw new Error("useAuthedUser was called outside an (app)/(private) route.");
  }

  return user;
}

/**
 * What to call someone in the chrome. Accounts predating the name field, and
 * Google profiles that had no name, both read as "" — so this is a real
 * fallback, not decoration. There is no PATCH /api/auth/me yet, so a person in
 * that state cannot fix it themselves.
 */
export function displayName(user: AuthUser) {
  return user.name || user.email.split("@")[0];
}
