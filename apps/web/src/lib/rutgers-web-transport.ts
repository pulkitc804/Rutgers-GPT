import {
  AcademicService,
  DiningService,
  mapPassioEtaResponse,
  parseMenuHtml,
  RUTGERS_SYSTEM_ID,
  type BusEta,
  type DiningLocationPreset,
  type ParsedDayMenu,
  type SocCourse,
  type SocCourseQuery,
} from "@rutgers-gpt/shared";

const PREFIX = "/api/rutgers";

async function readError(res: Response, label: string): Promise<never> {
  let msg = `${label} (HTTP ${res.status})`;
  try {
    const j = (await res.json()) as { error?: string };
    if (j?.error) msg = j.error;
  } catch {
    try {
      const t = await res.text();
      if (t) msg = t.slice(0, 240);
    } catch {
      /* ignore */
    }
  }
  throw new Error(msg);
}

/** Same-origin fetchers for the Next.js app (server proxy avoids CORS). */
export function createWebRutgersTransport() {
  return {
    async getStopEtas(params: {
      stopId: string;
      routeId?: string;
      position?: number;
      userId?: number;
    }): Promise<BusEta[]> {
      const userId = params.userId ?? RUTGERS_SYSTEM_ID;
      const sp = new URLSearchParams({ stopIds: params.stopId, userId: String(userId) });
      if (params.routeId) sp.set("routeId", params.routeId);
      if (params.position != null && params.position > 0) sp.set("position", String(params.position));
      const res = await fetch(`${PREFIX}/passio-eta?${sp.toString()}`);
      if (!res.ok) await readError(res, "Next bus");
      const json: unknown = await res.json();
      return mapPassioEtaResponse(json, params.stopId);
    },

    async loadParsedMenu(presetOrUrl: DiningLocationPreset | string): Promise<ParsedDayMenu> {
      const url = typeof presetOrUrl === "string" ? presetOrUrl : presetOrUrl.menuUrl;
      const label = typeof presetOrUrl === "string" ? undefined : presetOrUrl.label;
      const res = await fetch(`${PREFIX}/dining?target=${encodeURIComponent(url)}`);
      if (!res.ok) await readError(res, "Dining menu");
      const data = (await res.json()) as { html?: string; error?: string };
      if (data.error) throw new Error(data.error);
      if (!data.html) throw new Error("Dining menu: empty response");
      return parseMenuHtml(data.html, label);
    },

    async fetchCourses(q: SocCourseQuery): Promise<SocCourse[]> {
      const qs = AcademicService.buildQueryString(q);
      const res = await fetch(`${PREFIX}/soc?${qs}`);
      if (!res.ok) await readError(res, "Schedule of Classes");
      const data = (await res.json()) as SocCourse[];
      if (!Array.isArray(data)) throw new Error("SOC response was not a course list");
      return AcademicService.filterCoursesToQuery(data, q);
    },
  };
}

export type WebRutgersTransport = ReturnType<typeof createWebRutgersTransport>;
