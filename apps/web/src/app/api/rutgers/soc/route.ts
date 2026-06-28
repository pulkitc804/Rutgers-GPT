import { NextResponse } from "next/server";
import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

const SOC_BASE = "https://classes.rutgers.edu/soc/api/courses.json";

/** Server-side SOC proxy — avoids browser CORS on localhost. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  if (!qs) {
    return NextResponse.json({ error: "Missing query (year, term, subject, …)" }, { status: 400 });
  }
  try {
    const upstream = await fetchWithGuard(`${SOC_BASE}?${qs}`, {
      label: "SOC",
      timeoutMs: 9000,
      headers: {
        Accept: "application/json",
        "User-Agent": "RutgersGPT/1.0 (campus proxy; +https://rutgers.edu)",
      },
      cache: "no-store",
    });
    // SOC returns the entire campus/term catalog (filtered client-side), which is large.
    const text = await readTextCapped(upstream, 64_000_000, "SOC");
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `SOC upstream returned ${upstream.status}` },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `SOC proxy: ${msg}` }, { status: 502 });
  }
}
