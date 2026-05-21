import { NextResponse } from "next/server";

const SOC_BASE = "https://classes.rutgers.edu/soc/api/courses.json";

/** Server-side SOC proxy — avoids browser CORS on localhost. */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const qs = searchParams.toString();
  if (!qs) {
    return NextResponse.json({ error: "Missing query (year, term, subject, …)" }, { status: 400 });
  }
  try {
    const upstream = await fetch(`${SOC_BASE}?${qs}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "RutgersGPT/1.0 (campus proxy; +https://rutgers.edu)",
      },
      cache: "no-store",
    });
    const text = await upstream.text();
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
