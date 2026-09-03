import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";
import { initDeepLinkAuthListener, signInWithGoogle, signOut } from "../lib/auth";

interface AuthGateProps {
  children: (session: Session) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let unlisten: (() => void) | undefined;

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setSigningIn(false);
    });

    initDeepLinkAuthListener().then((fn) => {
      unlisten = fn;
    });

    return () => {
      sub.subscription.unsubscribe();
      unlisten?.();
    };
  }, []);

  if (loading) {
    return <div className="auth-gate auth-gate--loading">Loading…</div>;
  }

  if (!session) {
    return (
      <div className="auth-gate">
        <h1>Academic OS</h1>
        <p>Sign in with your personal Google account to continue.</p>
        <button
          disabled={signingIn}
          onClick={async () => {
            setError(null);
            setSigningIn(true);
            try {
              await signInWithGoogle();
            } catch (err) {
              setError(err instanceof Error ? err.message : String(err));
              setSigningIn(false);
            }
          }}
        >
          {signingIn ? "Opening browser…" : "Sign in with Google"}
        </button>
        {error && <p className="auth-gate__error">{error}</p>}
      </div>
    );
  }

  return (
    <>
      <div className="topbar">
        <span>{session.user.email}</span>
        <button onClick={() => void signOut()}>Sign out</button>
      </div>
      {children(session)}
    </>
  );
}
