// Run from packages/core:  npx vitest run --root ../../apps/desktop/src/lib --globals
import { errorBodyText, isGoogleAuthExpiredText } from "./google-auth-logic.ts";

// What the Edge Function really returns when the refresh token has died
// (seen 2026-10-08): Google's own body is embedded in our error string.
const REAL_BODY = JSON.stringify({
  error:
    'Failed to refresh Google access token: {\n  "error": "invalid_grant",\n  "error_description": "Token has been expired or revoked."\n}',
});

describe("isGoogleAuthExpiredText", () => {
  it("recognises Google's expired/revoked refresh-token error", () => {
    expect(isGoogleAuthExpiredText(REAL_BODY)).toBe(true);
    expect(isGoogleAuthExpiredText("Token has been expired or revoked.")).toBe(true);
  });
  it("ignores other failures, including a wrong client secret", () => {
    expect(isGoogleAuthExpiredText("Failed to fetch")).toBe(false);
    expect(isGoogleAuthExpiredText('{"error":"invalid_client"}')).toBe(false);
    expect(isGoogleAuthExpiredText("Google credentials are not configured")).toBe(false);
    expect(isGoogleAuthExpiredText("")).toBe(false);
  });
});

describe("errorBodyText", () => {
  it("reads the response body from a FunctionsHttpError-shaped error without consuming it", async () => {
    let cloned = false;
    const err = {
      message: "Edge Function returned a non-2xx status code",
      context: {
        clone: () => {
          cloned = true;
          return { text: async () => REAL_BODY };
        },
      },
    };
    const text = await errorBodyText(err);
    expect(cloned).toBe(true);
    expect(text).toContain("non-2xx");
    expect(isGoogleAuthExpiredText(text)).toBe(true);
  });
  it("falls back to .text() when there is no clone, and survives an unreadable body", async () => {
    expect(await errorBodyText({ message: "x", context: { text: async () => "invalid_grant" } })).toContain("invalid_grant");
    expect(await errorBodyText({ message: "boom", context: { text: async () => { throw new Error("used"); } } })).toBe("boom");
  });
  it("handles plain errors, strings and nullish values", async () => {
    expect(await errorBodyText(new Error("network down"))).toBe("network down");
    expect(await errorBodyText("oops")).toBe("oops");
    expect(await errorBodyText(null)).toBe("");
    expect(await errorBodyText(undefined)).toBe("");
  });
});
