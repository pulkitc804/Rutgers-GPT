import { NextResponse } from "next/server";
import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

const SOC_BASE = "https://classes.rutgers.edu/soc/api/courses.json";

// Strict allowlist: only these params are forwarded, each format-validated. Prevents the proxy
// from being an open relay that forwards arbitrary querystrings to Rutgers (which could get our
// server IP banned). NB-only by policy.
const PARAM_RULES: Record<string, RegExp> = {
  year: /^\d{4}$/,
  term: /^[0179]$/, // 0 winter, 1 spring, 7 summer, 9 fall
  campus: /^NB$/,
  subject: /^\d{2,3}$/,
  courseNumber: /^\d{2,4}[A-Za-z]?$/,
  level: /^(UG|G|UGRD|GRAD)$/i,
};

// SOC returns the ENTIRE campus/term catalog (~20MB) regardless of subject, filtered client-side.
// So cache one copy per (year,term,campus) — it serves every schedule query for that term.
const CATALOG_CACHE = new Map<string, { at: number; text: string }>();
const CATALOG_TTL_MS = 30 * 60 * 1000;
const CATALOG_MAX = 3;

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);

  // validate + rebuild a clean querystring from allowlisted params only
  const clean = new URLSearchParams();
  for (const [key, rule] of Object.entries(PARAM_RULES)) {
    const v = searchParams.get(key);
    if (v == null) continue;
    if (!rule.test(v)) {
      return NextResponse.json({ error: `Invalid value for "${key}"` }, { status: 400 });
    }
    clean.set(key, v);
  }
  if (!clean.get("year") || !clean.get("term")) {
    return NextResponse.json({ error: "Required: year, term (campus defaults to NB)" }, { status: 400 });
  }
  if (!clean.get("campus")) clean.set("campus", "NB");

  const cacheKey = `${clean.get("year")}-${clean.get("term")}-${clean.get("campus")}`;
  const hit = CATALOG_CACHE.get(cacheKey);
  if (hit && Date.now() - hit.at < CATALOG_TTL_MS) {
    return new NextResponse(hit.text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Cache": "HIT" },
    });
  }

  try {
    const upstream = await fetchWithGuard(`${SOC_BASE}?${clean.toString()}`, {
      label: "SOC",
      timeoutMs: 9000,
      redirect: "manual", // don't follow a redirect off-host (SSRF guard)
      headers: {
        Accept: "application/json",
        "User-Agent": "RutgersGPT/1.0 (campus proxy; +https://rutgers.edu)",
      },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json({ error: "SOC temporarily unavailable" }, { status: 502 });
    }
    // SOC genuinely returns the full ~20MB catalog; keep a high cap for it specifically.
    const text = await readTextCapped(upstream, 64_000_000, "SOC");

    if (CATALOG_CACHE.size >= CATALOG_MAX) CATALOG_CACHE.delete(CATALOG_CACHE.keys().next().value as string);
    CATALOG_CACHE.set(cacheKey, { at: Date.now(), text });

    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8", "X-Cache": "MISS" },
    });
  } catch (e) {
    console.error("SOC proxy error:", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "SOC temporarily unavailable" }, { status: 502 });
  }
}
