/**
 * Passio GO integration for Rutgers (rutgers.passiogo.com).
 * System id 1268 is the Rutgers University agency on this tenant (2026).
 */

export const RUTGERS_PASSIO_BASE = "https://rutgers.passiogo.com";
export const RUTGERS_SYSTEM_ID = 1268;

export type PassioStop = {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  routeId: string;
  routeName: string;
  routeShortname: string;
};

export type BusEta = {
  stopId: string;
  stopName: string;
  routeId: string;
  routeShortName: string;
  routeName: string;
  etaDisplay: string;
  etaMinutes: number | null;
  busName?: string;
  arrivalTimestamp?: number;
};

type StopsPayload = {
  stops?: Record<
    string,
    {
      id: string;
      name: string;
      latitude: number;
      longitude: number;
      routeId: string;
      routeName: string;
      routeShortname: string;
    }
  >;
};

type EtaPayload = {
  ETAs?: Record<
    string,
    Array<{
      eta?: string;
      etaR?: string | number;
      routeId?: string;
      busName?: string;
      arrivalTimestamp?: number;
      theStop?: { name?: string; shortName?: string; routeName?: string; routeId?: string; stopId?: string };
    }>
  >;
};

function parseEtaMinutes(etta: { eta?: string; etaR?: string | number }): number | null {
  if (typeof etta.etaR === "number" && Number.isFinite(etta.etaR)) return etta.etaR;
  if (typeof etta.etaR === "string") {
    const n = parseInt(etta.etaR, 10);
    if (!Number.isNaN(n)) return n;
  }
  const m = (etta.eta ?? "").match(/(\d+)\s*min/i);
  if (m) return parseInt(m[1], 10);
  return null;
}

/** Map Passio `mapGetData.php?eta=3` JSON to `BusEta[]` (extension + Next.js proxy). */
export function mapPassioEtaResponse(json: unknown, stopId: string): BusEta[] {
  const payload = json as EtaPayload;
  const list = payload.ETAs?.[stopId] ?? [];
  return list
    .filter((e) => e.eta && e.eta !== "no vehicles")
    .map((etta) => ({
      stopId: etta.theStop?.stopId ?? stopId,
      stopName: etta.theStop?.name ?? "",
      routeId: String(etta.routeId ?? etta.theStop?.routeId ?? ""),
      routeShortName: etta.theStop?.shortName ?? "",
      routeName: etta.theStop?.routeName ?? "",
      etaDisplay: (etta.eta ?? "").trim(),
      etaMinutes: parseEtaMinutes(etta),
      busName: etta.busName,
      arrivalTimestamp: etta.arrivalTimestamp,
    }));
}

async function postForm(url: string, body: Record<string, string>): Promise<unknown> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Passio request failed (${res.status}): ${url}`);
  return res.json();
}

export const BusService = {
  async listStops(): Promise<PassioStop[]> {
    const json = (await postForm(`${RUTGERS_PASSIO_BASE}/mapGetData.php?getStops=2`, {
      s0: String(RUTGERS_SYSTEM_ID),
      sA: "1",
    })) as StopsPayload;

    const out: PassioStop[] = [];
    for (const s of Object.values(json.stops ?? {})) {
      out.push({
        id: String(s.id),
        name: s.name,
        latitude: s.latitude,
        longitude: s.longitude,
        routeId: String(s.routeId),
        routeName: s.routeName,
        routeShortname: s.routeShortname,
      });
    }
    return out;
  },

  async getStopEtas(params: {
    stopId: string;
    routeId?: string;
    position?: number;
    userId?: number;
  }): Promise<BusEta[]> {
    const userId = params.userId ?? RUTGERS_SYSTEM_ID;
    const search = new URLSearchParams({
      eta: "3",
      stopIds: params.stopId,
      userId: String(userId),
    });
    if (params.routeId) search.set("routeId", params.routeId);
    if (params.position != null && params.position > 0) search.set("position", String(params.position));

    const res = await fetch(`${RUTGERS_PASSIO_BASE}/mapGetData.php?${search.toString()}`);
    if (!res.ok) throw new Error(`Passio ETA failed (${res.status})`);
    const json = await res.json();
    return mapPassioEtaResponse(json, params.stopId);
  },

  pickSoonest(etas: BusEta[]): BusEta | null {
    if (!etas.length) return null;
    const scored = etas.map((e) => ({ e, m: e.etaMinutes ?? Number.POSITIVE_INFINITY }));
    scored.sort((a, b) => a.m - b.m);
    return scored[0]?.e ?? null;
  },
};
