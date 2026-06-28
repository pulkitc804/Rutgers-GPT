import { NextResponse } from "next/server";
import { fetchWithGuard, readTextCapped } from "@rutgers-gpt/shared/net";

const PASSIO_BASE = "https://rutgers.passiogo.com";

/** Proxy Passio live ETA (GET mapGetData.php?eta=3&…). */
export async function GET(req: Request) {
  const sp = new URL(req.url).searchParams;
  const stopIds = sp.get("stopIds");
  const userId = sp.get("userId");
  if (!stopIds || !userId) {
    return NextResponse.json({ error: "Required: stopIds, userId" }, { status: 400 });
  }
  const out = new URLSearchParams({ eta: "3", stopIds, userId });
  const routeId = sp.get("routeId");
  const position = sp.get("position");
  if (routeId) out.set("routeId", routeId);
  if (position) out.set("position", position);

  try {
    const url = `${PASSIO_BASE}/mapGetData.php?${out.toString()}`;
    const upstream = await fetchWithGuard(url, {
      label: "Passio",
      timeoutMs: 7000,
      headers: {
        Accept: "application/json",
        "User-Agent": "RutgersGPT/1.0 (campus proxy; +https://rutgers.edu)",
      },
      cache: "no-store",
    });
    const text = await readTextCapped(upstream, 3_000_000, "Passio");
    if (!upstream.ok) {
      return NextResponse.json(
        { error: `Passio returned ${upstream.status}` },
        { status: upstream.status >= 500 ? 502 : upstream.status },
      );
    }
    const t = text.trim();
    if (!t.startsWith("{") && !t.startsWith("[")) {
      return NextResponse.json({ error: "Passio returned non-JSON (upstream may be blocking bots)" }, { status: 502 });
    }
    return new NextResponse(text, {
      status: 200,
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Passio proxy: ${msg}` }, { status: 502 });
  }
}
