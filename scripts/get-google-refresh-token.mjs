#!/usr/bin/env node
// One-time script: obtains a Google OAuth refresh token, scoped to
// drive.file + tasks + calendar, for the personal account the Edge
// Functions (drive-upload / drive-fetch / gtasks-sync / gcal-sync /
// timetable-ingest's calendar push) act as. Run once, copy the printed
// refresh_token straight into `supabase secrets set` yourself — this
// script never writes it to disk and this repo never sees it.
//
// Re-run this (and re-set the secret) any time the scope list changes —
// a refresh token only carries the scopes it was originally granted
// with, so adding "calendar" here means an OLD drive+tasks-only refresh
// token stops being enough and needs replacing, not just adding to.
//
// Prerequisites (Google Cloud Console, on the SAME OAuth client already
// used for Supabase Google sign-in):
//   1. APIs & Services -> Library -> enable "Google Drive API",
//      "Google Tasks API", and "Google Calendar API".
//   2. APIs & Services -> Credentials -> open that OAuth client -> Edit ->
//      Authorized redirect URIs -> add http://127.0.0.1:53682/callback
//      (skip if already added from an earlier run).
//
// Usage (PowerShell):
//   $env:GOOGLE_CLIENT_ID = "..."
//   $env:GOOGLE_CLIENT_SECRET = "..."
//   node scripts/get-google-refresh-token.mjs
//
// The script opens your browser, you approve access to your OWN personal
// Drive + Tasks + Calendar, and it prints a refresh_token once. Store it immediately
// with the command it prints, then close this terminal. Do not paste the
// token anywhere else.

import { createServer } from "node:http";
import { randomBytes, createHash } from "node:crypto";

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/callback`;
const SCOPES = [
  "https://www.googleapis.com/auth/drive.file",
  "https://www.googleapis.com/auth/tasks",
  "https://www.googleapis.com/auth/calendar",
].join(" ");

const clientId = process.env.GOOGLE_CLIENT_ID;
const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

if (!clientId || !clientSecret) {
  console.error(
    "Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in this shell first (see the comment at the top of this file)."
  );
  process.exit(1);
}

function base64url(buf) {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const codeVerifier = base64url(randomBytes(32));
const codeChallenge = base64url(createHash("sha256").update(codeVerifier).digest());

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", SCOPES);
authUrl.searchParams.set("access_type", "offline");
// Forces the consent screen every run, which is what makes Google reissue
// a refresh_token even if these scopes were already granted before.
authUrl.searchParams.set("prompt", "consent");
authUrl.searchParams.set("code_challenge", codeChallenge);
authUrl.searchParams.set("code_challenge_method", "S256");

const server = createServer(async (req, res) => {
  const url = new URL(req.url, REDIRECT_URI);
  if (url.pathname !== "/callback") {
    res.writeHead(404).end();
    return;
  }

  const code = url.searchParams.get("code");
  const err = url.searchParams.get("error");

  if (err || !code) {
    res.writeHead(400, { "Content-Type": "text/html" }).end(`<h2>Failed: ${err ?? "no code"}</h2>`);
    console.error("Authorization failed:", err ?? "no code returned");
    server.close();
    process.exit(1);
  }

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: REDIRECT_URI,
      grant_type: "authorization_code",
      code_verifier: codeVerifier,
    }),
  });
  const tokens = await tokenRes.json();

  if (!tokenRes.ok || !tokens.refresh_token) {
    res
      .writeHead(500, { "Content-Type": "text/html" })
      .end("<h2>Token exchange failed — check this terminal.</h2>");
    console.error("Token exchange failed:", tokens);
    server.close();
    process.exit(1);
  }

  res
    .writeHead(200, { "Content-Type": "text/html" })
    .end("<h2>Done — you can close this tab and return to the terminal.</h2>");

  console.log("\nrefresh_token (store this now, shown once):\n");
  console.log(tokens.refresh_token);
  console.log(
    "\nRun this yourself in your own terminal (do not paste the token anywhere else):\n"
  );
  console.log(`npx supabase secrets set GOOGLE_DRIVE_REFRESH_TOKEN=${tokens.refresh_token}`);

  server.close();
});

server.listen(PORT, () => {
  console.log("Open this URL in your browser (copy-paste the whole thing):\n");
  console.log(authUrl.toString());
  console.log("\nWaiting for the redirect back to this script...");
});
