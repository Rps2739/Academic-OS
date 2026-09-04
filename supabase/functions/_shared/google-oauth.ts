// Exchanges the stored refresh_token for a short-lived Google access
// token. Called once per invocation — Edge Functions are stateless, so
// there's no instance to cache a token across calls, and minting a fresh
// one is cheap. One refresh token covers every scope it was granted with
// (currently drive.file + tasks — see scripts/get-google-refresh-token.mjs),
// so this single function serves both the Drive and Google Tasks functions.
export async function getGoogleAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_CLIENT_ID");
  const clientSecret = Deno.env.get("GOOGLE_CLIENT_SECRET");
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN");
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error("Google credentials are not configured");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    throw new Error(`Failed to refresh Google access token: ${await res.text()}`);
  }
  const data = await res.json();
  return data.access_token as string;
}
