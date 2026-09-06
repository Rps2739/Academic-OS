import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { GraduationCap, AlertCircle, LayoutPanelTop, Sun, Moon } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { supabase } from "../lib/supabase";
import { initDeepLinkAuthListener, signInWithGoogle, signOut } from "../lib/auth";
import { readPref, writePref, type ThemeName } from "../lib/reading-prefs";

interface AuthGateProps {
  children: (session: Session) => ReactNode;
}

export function AuthGate({ children }: AuthGateProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeName>(() => readPref("theme", "dark" as ThemeName));

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
        <div className="auth-gate__mark">
          <GraduationCap size={26} strokeWidth={2} />
        </div>
        <h1>Academic OS</h1>
        <p>Sign in with your personal Google account to continue.</p>
        <button
          className="btn btn--primary"
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
          {signingIn && <span className="spinner" aria-hidden />}
          {signingIn ? "Opening browser…" : "Sign in with Google"}
        </button>
        {error && (
          <div className="auth-gate__error">
            <AlertCircle size={14} strokeWidth={2} />
            <span>{error}</span>
          </div>
        )}
      </div>
    );
  }

  const initial = (session.user.email ?? "?").charAt(0).toUpperCase();

  return (
    <>
      <div className="topbar">
        <div className="topbar__identity">
          <span className="topbar__avatar">{initial}</span>
          <span className="topbar__email">{session.user.email}</span>
        </div>
        <div className="topbar__actions">
          <button
            className="btn btn--ghost"
            title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            onClick={() => {
              const next: ThemeName = theme === "dark" ? "light" : "dark";
              setTheme(next);
              writePref("theme", next);
              document.documentElement.setAttribute("data-theme", next);
            }}
          >
            {theme === "dark" ? <Sun size={14} strokeWidth={2} /> : <Moon size={14} strokeWidth={2} />}
          </button>
          <button
            className="btn btn--ghost"
            title="Show/hide the desktop widget panels"
            onClick={() => void invoke("toggle_widgets")}
          >
            <LayoutPanelTop size={14} strokeWidth={2} />
            Widgets
          </button>
          <button className="btn btn--ghost" onClick={() => void signOut()}>
            Sign out
          </button>
        </div>
      </div>
      {children(session)}
    </>
  );
}
