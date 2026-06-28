import { NextResponse } from "next/server";
import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

const ALLOWED_PREFIXES = [
  "https://menuportal23.dining.rutgers.edu/",
  "https://food.rutgers.edu/",
  "http://menuportal23.dining.rutgers.edu/",
];

function isAllowedTarget(url: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return false;
    if (ALLOWED_PREFIXES.some((p) => url.startsWith(p))) return true;
    if (u.hostname.endsWith(".dining.rutgers.edu")) return true;
    if (u.hostname.endsWith(".nutrislice.com")) return true;
    return false;
  } catch {
    return false;
  }
}

/** Fetch dining menu HTML server-side (FoodPro / allowed Rutgers hosts). */
export async function GET(req: Request) {
  const target = new URL(req.url).searchParams.get("target");
  if (!target) {
    return NextResponse.json({ error: "Missing ?target= URL (encoded menu page)" }, { status: 400 });
  }
  let decoded: string;
  try {
    decoded = decodeURIComponent(target);
  } catch {
    return NextResponse.json({ error: "Invalid target encoding" }, { status: 400 });
  }
  if (!isAllowedTarget(decoded)) {
    return NextResponse.json({ error: "Target URL is not on the allowlist" }, { status: 400 });
  }
  try {
    const upstream = await fetchWithGuard(decoded, {
      label: "Dining",
      timeoutMs: 8000,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "RutgersGPT/1.0 (campus proxy; +https://rutgers.edu)",
      },
      cache: "no-store",
    });
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Dining upstream returned ${upstream.status}` },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }
    const html = await readTextCapped(upstream, 5_000_000, "Dining");
    return NextResponse.json({ html });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Dining proxy: ${msg}` }, { status: 502 });
  }
}
