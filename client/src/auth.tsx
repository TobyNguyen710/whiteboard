import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { accountDisplay, type HandshakeAuth } from "@whiteboard/shared";
import { getGuestId, getGuestName } from "./guestName";
import { supabase } from "./supabase";

export type LoginProvider = "google" | "github";

export type Account = { id: string; name: string; avatarUrl: string | null; email: string | null };

type AuthState = {
  /** False when login isn't configured for this build (everyone is a guest). */
  enabled: boolean;
  /** True until the saved session (if any) has been read on page load. */
  loading: boolean;
  session: Session | null;
  account: Account | null;
  signIn: (provider: LoginProvider) => Promise<void>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthState | null>(null);

function accountFrom(session: Session | null): Account | null {
  if (!session) return null;
  const { id, email, user_metadata } = session.user;
  return { id, email: email ?? null, ...accountDisplay(user_metadata ?? {}, email) };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabase !== null);

  useEffect(() => {
    if (!supabase) return;
    // Reads a saved session, or finishes a sign-in redirect (?code=... in the URL).
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => setSession(next));
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<AuthState>(
    () => ({
      enabled: supabase !== null,
      loading,
      session,
      account: accountFrom(session),
      signIn: async (provider) => {
        if (!supabase) return;
        // Come back to the same page (home or a board) after signing in.
        const { error } = await supabase.auth.signInWithOAuth({
          provider,
          options: { redirectTo: window.location.href },
        });
        if (error) throw error;
      },
      signOut: async () => {
        if (!supabase) return;
        await supabase.auth.signOut();
      },
    }),
    [loading, session],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Who we are, for the socket connection: the current login token (Supabase keeps it refreshed),
 * or the guest name. Read fresh on every (re)connect.
 */
export async function currentHandshakeAuth(): Promise<HandshakeAuth> {
  const session = supabase ? (await supabase.auth.getSession()).data.session : null;
  return session ? { token: session.access_token } : { guestName: getGuestName(), guestId: getGuestId() };
}

export function useAuth(): AuthState {
  const auth = useContext(AuthContext);
  if (!auth) throw new Error("useAuth must be used inside <AuthProvider>");
  return auth;
}
