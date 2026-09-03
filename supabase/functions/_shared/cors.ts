// Edge Functions don't add CORS headers on their own — every response,
// including the browser's preflight OPTIONS request, needs these or the
// desktop app's webview fetch() never even reaches this code. The actual
// security boundary is the required Supabase session JWT, not origin
// checking, so a wildcard origin here is fine for this single-user app.
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
