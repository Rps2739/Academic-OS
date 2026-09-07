/** Blocks a URL from targeting internal/private network ranges — any
 * function that fetches a caller-supplied URL server-side must never become
 * an open SSRF proxy, even in a single-user app. Shared by news-fetch
 * (custom feed URLs) and article-reader (arbitrary article links, including
 * ones a redirect chain leads to).
 *
 * Two layers, because a hostname string alone isn't enough:
 * 1. Reject private/loopback/link-local IP literals in the URL itself —
 *    both IPv4 and IPv6 forms, including IPv4-mapped IPv6.
 * 2. Actually resolve the hostname via DNS and check every returned
 *    address too. A public-looking domain can have an A/AAAA record
 *    pointing straight at 127.0.0.1 or a cloud metadata endpoint
 *    (169.254.169.254) — a string-only check on the hostname text would
 *    never catch that (a DNS-based allowlist bypass).
 *
 * Known accepted limitation: this checks DNS at validate-time, not at the
 * moment fetch() actually connects, so a sophisticated DNS-rebinding
 * attack (return a safe IP for validation, then a different malicious IP
 * moments later when the real connection happens) is not fully closed —
 * Deno's fetch() has no supported hook to pin a connection to a
 * specific pre-resolved IP while still using a hostname for TLS. Given
 * this is a personal, single-user app rather than a public multi-tenant
 * service, defending against an adversary actively racing DNS TTLs against
 * this specific user's requests is out of proportion to the actual threat
 * model; documented here rather than silently left unstated.
 */

function isPrivateOrLoopbackIPv4(ip: string): boolean {
  const m = ip.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 127) return true; // loopback
  if (a === 10) return true; // private
  if (a === 0) return true; // "this network" / unspecified
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata (169.254.169.254)
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // carrier-grade NAT / shared address space
  return false;
}

function isPrivateOrLoopbackIPv6(raw: string): boolean {
  const h = raw.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "::1" || h === "::") return true; // loopback / unspecified
  if (/^fe[89ab][0-9a-f]:/.test(h)) return true; // link-local fe80::/10
  if (/^f[cd][0-9a-f]{2}:/.test(h)) return true; // unique local fc00::/7
  // IPv4-mapped IPv6 (::ffff:127.0.0.1 or ::ffff:7f00:1 forms)
  const mappedDotted = h.match(/^::ffff:(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})$/);
  if (mappedDotted && isPrivateOrLoopbackIPv4(mappedDotted[1])) return true;
  return false;
}

function isPrivateOrLocalHostLiteral(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost") return true;
  if (isPrivateOrLoopbackIPv4(h)) return true;
  if (isPrivateOrLoopbackIPv6(h)) return true;
  return false;
}

async function resolvesToPrivateHost(hostname: string): Promise<boolean> {
  if (isPrivateOrLocalHostLiteral(hostname)) return true;
  try {
    const [v4, v6] = await Promise.all([
      Deno.resolveDns(hostname, "A").catch(() => [] as string[]),
      Deno.resolveDns(hostname, "AAAA").catch(() => [] as string[]),
    ]);
    if (v4.length === 0 && v6.length === 0) return true; // couldn't resolve — fail closed
    for (const ip of v4) if (isPrivateOrLoopbackIPv4(ip)) return true;
    for (const ip of v6) if (isPrivateOrLoopbackIPv6(ip)) return true;
    return false;
  } catch {
    return true; // DNS lookup failed entirely — fail closed
  }
}

/** Returns the normalised URL string if it's a safe http(s), non-private
 * target — checked both by literal IP and by resolving DNS — otherwise
 * null. Async because DNS resolution is async. */
export async function validateExternalUrl(raw: string): Promise<string | null> {
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    if (await resolvesToPrivateHost(u.hostname)) return null;
    return u.toString();
  } catch {
    return null;
  }
}

const MAX_REDIRECTS = 5;

/**
 * fetch() with every redirect hop re-validated, not just the initial URL.
 * A plain `fetch(url)` follows redirects automatically and would happily
 * land on a private/internal address if the (validated, public) starting
 * URL replies with a 3xx pointing there — the classic SSRF-via-redirect
 * bypass. Every function that fetches a caller-influenced or third-party
 * URL server-side (custom feed URLs, article links) must use this instead
 * of the global fetch.
 */
export async function safeFetch(startUrl: string, init: RequestInit = {}): Promise<Response> {
  let current = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const validated = await validateExternalUrl(current);
    if (!validated) throw new Error(`Refusing to fetch disallowed URL: ${current}`);

    const res = await fetch(validated, { ...init, redirect: "manual" });

    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new Error(`Redirect response with no Location header from ${validated}`);
      // Location may be relative — resolve it against the URL that issued it.
      current = new URL(location, validated).toString();
      continue;
    }
    return res;
  }
  throw new Error(`Too many redirects fetching ${startUrl}`);
}
