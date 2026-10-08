import { useEffect, useState } from "react";
import { ChevronDown, Copy, RefreshCw, TriangleAlert } from "lucide-react";
import { useGoogleAuthExpiredSince, getGoogleAuthExpiredSince } from "../lib/google-auth-status";

const COMMAND = "node scripts/get-google-refresh-token.mjs";

interface GoogleAuthBannerProps {
  /** Runs one Google sync right now; the banner clears itself if it succeeds. */
  onRecheck: () => Promise<void>;
}

/**
 * Shown under the top bar when the server's Google sign-in has expired —
 * the calendar, Google Tasks and automated timetable imports all stop at
 * once and used to fail silently for days. The steps are the manual renewal
 * the user runs themselves (it handles their Google secrets, which this app
 * and its assistant never touch). Disappears by itself on the next
 * successful sync.
 */
export function GoogleAuthBanner({ onRecheck }: GoogleAuthBannerProps) {
  const since = useGoogleAuthExpiredSince();
  const [open, setOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [stillExpired, setStillExpired] = useState(false);
  const [copied, setCopied] = useState(false);

  // The app layout is sized as "viewport minus top bar"; reserve this bar's
  // height too so nothing at the bottom gets pushed off-screen.
  useEffect(() => {
    document.documentElement.style.setProperty("--banner-h", since ? "37px" : "0px");
    return () => document.documentElement.style.setProperty("--banner-h", "0px");
  }, [since]);

  if (!since) return null;

  const day = new Date(since).toLocaleDateString(undefined, { day: "numeric", month: "short" });

  async function recheck() {
    setChecking(true);
    setStillExpired(false);
    try {
      await onRecheck();
    } finally {
      setChecking(false);
      // If the sync succeeded the store has already cleared and this
      // component is about to unmount; otherwise say so.
      setStillExpired(getGoogleAuthExpiredSince() !== null);
    }
  }

  async function copyCommand() {
    try {
      await navigator.clipboard.writeText(COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      /* clipboard blocked — the command is shown on screen anyway */
    }
  }

  return (
    <div className="gauth" role="alert">
      <div className="gauth__bar">
        <TriangleAlert size={15} strokeWidth={2} />
        <span className="gauth__text">
          <strong>Google sign-in expired</strong> (noticed {day}). Calendar, Google Tasks and automatic timetable imports are
          paused until you renew it.
        </span>
        <button className="btn btn--ghost btn--sm" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
          How to fix <ChevronDown size={13} strokeWidth={2} className={open ? "gauth__chev gauth__chev--open" : "gauth__chev"} />
        </button>
        <button className="btn btn--secondary btn--sm" disabled={checking} onClick={() => void recheck()}>
          <RefreshCw size={13} strokeWidth={2} className={checking ? "spin" : ""} /> Check again
        </button>
      </div>
      {open && (
        <div className="gauth__panel">
          <ol>
            <li>
              In Google Cloud Console (project <strong>RPScap</strong> → APIs &amp; Services → Credentials) open your OAuth
              client and copy its client ID and client secret.
            </li>
            <li>
              Open PowerShell in the Academic OS project folder, set <code>GOOGLE_CLIENT_ID</code> and{" "}
              <code>GOOGLE_CLIENT_SECRET</code> to those values, then run:
              <div className="gauth__cmd">
                <code>{COMMAND}</code>
                <button className="btn btn--ghost btn--sm" onClick={() => void copyCommand()}>
                  <Copy size={12} strokeWidth={2} /> {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </li>
            <li>
              Approve access in the browser window that opens, then run the <code>npx supabase secrets set …</code> command
              it prints.
            </li>
            <li>Come back here and press <strong>Check again</strong>. This banner disappears once Google answers.</li>
          </ol>
          <p className="gauth__note">
            This happens about every 7 days while the Google project is in "Testing" mode. Never paste the secret anywhere
            except your own terminal.
          </p>
        </div>
      )}
      {stillExpired && !checking && (
        <div className="gauth__still">
          Still not working. If you've just renewed it, make sure the <code>supabase secrets set</code> command finished,
          wait a minute, and check again.
        </div>
      )}
    </div>
  );
}
