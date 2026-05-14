"use client";

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AcademicService, nextOccurrence, type SocCourse, type SocCourseQuery } from "../services/AcademicService";
import { BusService, type BusEta } from "../services/BusService";
import { DEFAULT_DINING_LOCATIONS, DiningService, type DiningLocationPreset, type ParsedDayMenu } from "../services/DiningService";
import { createRutgersIQStore, type RutgersIQStoreHook } from "../store/rutgers-iq-store";

/** Override data loading (e.g. Next.js `/api/*` proxies to avoid browser CORS). */
export type RutgersDataTransport = {
  getStopEtas: (params: {
    stopId: string;
    routeId?: string;
    position?: number;
    userId?: number;
  }) => Promise<BusEta[]>;
  loadParsedMenu: (presetOrUrl: DiningLocationPreset | string) => Promise<ParsedDayMenu>;
  fetchCourses: (q: SocCourseQuery) => Promise<SocCourse[]>;
};

/** Snapshot passed to the Scarlet Oracle / analytics after each refresh. */
export type RutgersLiveDataPayload = {
  refreshedAt: string;
  busText: string;
  diningText: string;
  academicText: string;
  wellnessText: string;
};

export type RutgersDashboardProps = {
  useStore?: RutgersIQStoreHook;
  /** When set (e.g. web app), bypasses direct third-party fetches. */
  transport?: RutgersDataTransport;
  title?: string;
  showHeader?: boolean;
  onLiveData?: (payload: RutgersLiveDataPayload) => void;
  /** Assign `ref.current = () => refresh()` for parent controls (e.g. Oracle panel). */
  dashboardRefreshRef?: MutableRefObject<(() => void) | null>;
};

type PanelState = {
  bus: { loading: boolean; error?: string; next?: BusEta | null; all?: BusEta[] };
  dining: { loading: boolean; error?: string; parsed?: ParsedDayMenu };
  academic: { loading: boolean; error?: string; summary?: string; meta?: string; when?: string };
};

const WELLNESS_CONTEXT_BLURB = [
  "Student wellness (official portals — not medical advice):",
  "CAPS — https://health.rutgers.edu/counseling",
  "Student Health Services (Hurtado, etc.) — https://health.rutgers.edu",
  "TimelyCare (telehealth) — https://www.timelycare.com/rutgers",
].join("\n");

function inferSocQuery(now: Date, subject: string, courseNumber: string): SocCourseQuery {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  if (month >= 1 && month <= 5) return { year, term: 1, campus: "NB", subject, courseNumber };
  if (month >= 6 && month <= 8) return { year, term: 7, campus: "NB", subject, courseNumber };
  return { year, term: 9, campus: "NB", subject, courseNumber };
}

function termLabel(term: number): string {
  if (term === 1) return "Spring";
  if (term === 7) return "Summer";
  if (term === 9) return "Fall";
  if (term === 0) return "Winter";
  return `Term ${term}`;
}

function humanFetchError(e: Error): string {
  const m = e.message || "Something went wrong";
  if (/failed to fetch/i.test(m)) {
    return "Could not reach Rutgers services from this page. If you are on the website, ensure API routes are enabled; otherwise check your network.";
  }
  return m;
}

let defaultStore: RutgersIQStoreHook | null = null;
function getDefaultStore(): RutgersIQStoreHook {
  if (!defaultStore) defaultStore = createRutgersIQStore();
  return defaultStore;
}

export function RutgersDashboard(props: RutgersDashboardProps) {
  const useStore = props.useStore ?? getDefaultStore();
  const transport = props.transport;
  const favoriteStopId = useStore((s) => s.favoriteStopId);
  const demoSubject = useStore((s) => s.demoSubject);
  const demoCourseNumber = useStore((s) => s.demoCourseNumber);
  const diningLocationId = useStore((s) => s.diningLocationId);
  const setDiningLocationId = useStore((s) => s.setDiningLocationId);

  const onLiveDataRef = useRef(props.onLiveData);
  onLiveDataRef.current = props.onLiveData;

  const socQuery = useMemo(
    () => inferSocQuery(new Date(), demoSubject, demoCourseNumber),
    [demoSubject, demoCourseNumber],
  );

  const diningPreset = useMemo(
    () => DEFAULT_DINING_LOCATIONS.find((d) => d.id === diningLocationId) ?? DEFAULT_DINING_LOCATIONS[0],
    [diningLocationId],
  );

  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [state, setState] = useState<PanelState>({
    bus: { loading: true },
    dining: { loading: true },
    academic: { loading: true },
  });

  const getEtas = useCallback(
    (p: { stopId: string; routeId?: string; position?: number; userId?: number }) =>
      transport ? transport.getStopEtas(p) : BusService.getStopEtas(p),
    [transport],
  );

  const loadMenu = useCallback(
    (preset: (typeof DEFAULT_DINING_LOCATIONS)[0]) =>
      transport ? transport.loadParsedMenu(preset) : DiningService.loadParsedMenu(preset),
    [transport],
  );

  const loadCourses = useCallback(
    (q: SocCourseQuery) => (transport ? transport.fetchCourses(q) : AcademicService.fetchCourses(q)),
    [transport],
  );

  const refresh = useCallback(async () => {
    setState({
      bus: { loading: true },
      dining: { loading: true },
      academic: { loading: true },
    });

    const refreshedAt = new Date().toISOString();

    const [busR, dineR, acadR] = await Promise.allSettled([
      getEtas({ stopId: favoriteStopId }),
      loadMenu(diningPreset),
      loadCourses(socQuery),
    ]);

    let busState: PanelState["bus"];
    let diningState: PanelState["dining"];
    let academicState: PanelState["academic"];
    let busText = "";
    let diningText = "";
    let academicText = "";

    if (busR.status === "fulfilled") {
      const etas = busR.value;
      const next = BusService.pickSoonest(etas);
      busState = { loading: false, next, all: etas };
      busText = next
        ? `Live ETAs (Passio GO): next ${next.etaDisplay} · ${next.routeShortName || next.routeName} · stop ${favoriteStopId}${next.stopName ? ` (${next.stopName})` : ""}. Other arrivals: ${etas
            .slice(1, 6)
            .map((e) => `${e.etaDisplay} ${e.routeShortName || e.routeName}`)
            .join("; ") || "none"}.`
        : `No live ETAs returned for stop ${favoriteStopId} (verify stop ID on the Passio GO map).`;
    } else {
      const err = busR.reason instanceof Error ? busR.reason : new Error(String(busR.reason));
      busState = { loading: false, error: humanFetchError(err) };
      busText = `Transit unavailable: ${humanFetchError(err)}`;
    }

    if (dineR.status === "fulfilled") {
      const parsed = dineR.value;
      diningState = { loading: false, parsed };
      const sum = DiningService.summarizeNextMeal(parsed, 12);
      diningText = [
        `Location: ${parsed.locationLabel} (${diningPreset.label}).`,
        parsed.meal ? `Meal period: ${parsed.meal}.` : "",
        parsed.dateLabel ? `Menu date: ${parsed.dateLabel}.` : "",
        sum ? `Highlights: ${sum.headline}. ${sum.detail}` : "",
        `Stations with items: ${parsed.stations.filter((s) => s.items.length).length}.`,
      ]
        .filter(Boolean)
        .join(" ");
    } else {
      const err = dineR.reason instanceof Error ? dineR.reason : new Error(String(dineR.reason));
      diningState = { loading: false, error: humanFetchError(err) };
      diningText = `Dining unavailable: ${humanFetchError(err)}`;
    }

    if (acadR.status === "fulfilled") {
      const courses = acadR.value;
      if (!courses.length) {
        academicState = {
          loading: false,
          summary: `No SOC rows for ${socQuery.subject}:${socQuery.courseNumber} this term.`,
          meta: `${socQuery.campus ?? "NB"} · ${socQuery.year} ${termLabel(socQuery.term)}`,
        };
        academicText = `${academicState.summary} (${academicState.meta}). Adjust subject, course number, or term.`;
      } else {
        const next = AcademicService.findNextMeeting(courses, new Date());
        if (!next) {
          academicState = {
            loading: false,
            summary: "No meeting times found for filtered sections.",
            meta: `${courses[0]?.courseString ?? ""}`,
          };
          academicText = `${academicState.summary} Course: ${academicState.meta}.`;
        } else {
          const when = nextOccurrence(next, new Date());
          const whenStr = when.toLocaleString(undefined, {
            weekday: "long",
            month: "short",
            day: "numeric",
            hour: "numeric",
            minute: "2-digit",
          });
          academicState = {
            loading: false,
            summary: next.title.trim(),
            meta: `${next.courseString} · Section ${next.sectionNumber} · ${next.dayCode} ${formatMeetingTime(next)} · ${next.campusAbbrev ?? "NB"}`,
            when: `${whenStr} · ${next.room?.trim() || "Room TBA"}`,
          };
          academicText = `Next class meeting: ${next.courseString} "${next.title}" · ${academicState.meta} · Starts: ${academicState.when}`;
        }
      }
    } else {
      const err = acadR.reason instanceof Error ? acadR.reason : new Error(String(acadR.reason));
      academicState = { loading: false, error: humanFetchError(err) };
      academicText = `Schedule (SOC) unavailable: ${humanFetchError(err)}`;
    }

    setState({ bus: busState, dining: diningState, academic: academicState });
    setUpdatedAt(new Date());

    onLiveDataRef.current?.({
      refreshedAt,
      busText,
      diningText,
      academicText,
      wellnessText: WELLNESS_CONTEXT_BLURB,
    });
  }, [socQuery, favoriteStopId, diningPreset, getEtas, loadMenu, loadCourses]);

  useLayoutEffect(() => {
    const ref = props.dashboardRefreshRef;
    if (!ref) return;
    ref.current = () => void refresh();
    return () => {
      ref.current = null;
    };
  }, [props.dashboardRefreshRef, refresh]);

  useEffect(() => {
    const p = useStore.persist;
    if (p && typeof (p as { rehydrate?: () => void }).rehydrate === "function") {
      void (p as { rehydrate: () => void }).rehydrate();
    }
  }, [useStore]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const title = props.title ?? "Rutgers IQ";
  const diningSummary = state.dining.parsed ? DiningService.summarizeNextMeal(state.dining.parsed, 12) : null;
  const stations = state.dining.parsed?.stations?.filter((st) => st.items.length) ?? [];

  return (
    <div className="min-h-0 bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 p-4 text-slate-100 md:p-6">
      {props.showHeader !== false && (
        <header className="mb-6 flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white md:text-2xl">{title}</h1>
            <p className="mt-1 max-w-3xl text-sm text-slate-400">
              One hub for <strong className="font-medium text-slate-200">transit, dining, classes, wellness links,</strong> and your
              Scarlet Oracle brief — all grounded in live Rutgers data when you refresh.
            </p>
            {updatedAt && (
              <p className="mt-2 text-xs text-slate-500">Updated {updatedAt.toLocaleTimeString(undefined, { timeStyle: "short" })}</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => void refresh()}
            className="shrink-0 rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-sm font-medium text-slate-100 shadow hover:bg-slate-700"
          >
            Refresh all
          </button>
        </header>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        <span className="w-full text-[11px] font-semibold uppercase tracking-widest text-slate-500">Dining location</span>
        {DEFAULT_DINING_LOCATIONS.map((loc) => (
          <button
            key={loc.id}
            type="button"
            onClick={() => setDiningLocationId(loc.id)}
            className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
              loc.id === diningPreset.id
                ? "border-[#CC0033]/80 bg-[#CC0033]/20 text-white"
                : "border-slate-700 bg-slate-900/80 text-slate-300 hover:border-slate-500"
            }`}
          >
            {loc.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <section className="lg:col-span-1">
          <CategoryLabel icon="🚌" label="Transit" hint="Passio GO · New Brunswick" />
          <DashboardCard title="Next bus" subtitle={`Stop ID ${favoriteStopId}`} loading={state.bus.loading} error={state.bus.error}>
            {state.bus.next ? (
              <div className="space-y-3">
                <p className="text-3xl font-semibold tabular-nums text-white">{state.bus.next.etaDisplay}</p>
                <p className="text-sm text-slate-300">
                  <span className="font-medium text-slate-200">{state.bus.next.routeShortName || state.bus.next.routeName}</span>
                  {state.bus.next.stopName ? ` · ${state.bus.next.stopName}` : ""}
                  {state.bus.next.busName ? ` · Bus ${state.bus.next.busName}` : ""}
                </p>
                {state.bus.all && state.bus.all.length > 1 && (
                  <div className="rounded-lg border border-slate-800 bg-slate-950/50 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Other arrivals</p>
                    <ul className="mt-2 space-y-1.5 text-sm text-slate-300">
                      {state.bus.all.slice(1, 5).map((e, i) => (
                        <li key={`${e.routeId}-${e.busName}-${i}`}>
                          {e.etaDisplay.trim()} · {e.routeShortName || e.routeName}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ) : (
              !state.bus.loading &&
              !state.bus.error && <p className="text-sm text-slate-400">No live ETAs for this stop right now.</p>
            )}
          </DashboardCard>
        </section>

        <section className="lg:col-span-1">
          <CategoryLabel icon="🍽" label="Dining" hint={diningPreset.label} />
          <DashboardCard title="Menus" subtitle="Today’s station highlights" loading={state.dining.loading} error={state.dining.error}>
            {diningSummary && (
              <div className="space-y-3">
                <p className="text-base font-medium leading-snug text-white">{diningSummary.headline}</p>
                <p className="text-sm leading-relaxed text-slate-300">{diningSummary.detail}</p>
                {stations.length > 0 && (
                  <div className="space-y-2">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">By station</p>
                    <ul className="max-h-48 space-y-2 overflow-y-auto pr-1 text-sm">
                      {stations.slice(0, 6).map((st) => (
                        <li key={st.title} className="rounded-md border border-slate-800/80 bg-slate-950/40 p-2">
                          <span className="font-medium text-slate-200">{st.title}</span>
                          <span className="mt-1 block text-slate-400">{st.items.slice(0, 4).join(" · ")}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </DashboardCard>
        </section>

        <section className="lg:col-span-1">
          <CategoryLabel icon="📚" label="Classes" hint="SOC · your course" />
          <DashboardCard
            title="Next meeting"
            subtitle={`${demoSubject}:${demoCourseNumber} · ${socQuery.year} ${termLabel(socQuery.term)} · ${socQuery.campus ?? "NB"}`}
            loading={state.academic.loading}
            error={state.academic.error}
          >
            {state.academic.summary && (
              <div className="space-y-2">
                <p className="text-lg font-semibold leading-snug text-white">{state.academic.summary}</p>
                {state.academic.meta && <p className="text-sm text-slate-400">{state.academic.meta}</p>}
                {state.academic.when && (
                  <p className="rounded-lg border border-slate-800 bg-slate-950/50 p-3 text-sm text-slate-200">{state.academic.when}</p>
                )}
              </div>
            )}
          </DashboardCard>
        </section>
      </div>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        <DashboardCard title="Wellness & support" subtitle="Official Rutgers — verify hours before you go" loading={false}>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://health.rutgers.edu/counseling" target="_blank" rel="noreferrer">
                CAPS (counseling)
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://health.rutgers.edu" target="_blank" rel="noreferrer">
                Student Health (Hurtado & clinics)
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://www.timelycare.com/rutgers" target="_blank" rel="noreferrer">
                TimelyCare (24/7 telehealth)
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://deanofstudents.rutgers.edu" target="_blank" rel="noreferrer">
                Dean of Students / basic needs
              </a>
            </li>
          </ul>
        </DashboardCard>

        <DashboardCard title="Official tools" subtitle="Open in a new tab" loading={false}>
          <ul className="space-y-2 text-sm text-slate-300">
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://rutgers.passiogo.com/" target="_blank" rel="noreferrer">
                Passio GO (all routes & maps)
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://sis.rutgers.edu/soc/" target="_blank" rel="noreferrer">
                Schedule of Classes
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://dining.rutgers.edu" target="_blank" rel="noreferrer">
                Dining Services
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://canvas.rutgers.edu" target="_blank" rel="noreferrer">
                Canvas
              </a>
            </li>
            <li>
              <a className="text-[#f7c5cd] underline-offset-2 hover:underline" href="https://dn.rutgers.edu" target="_blank" rel="noreferrer">
                Degree Navigator
              </a>
            </li>
          </ul>
        </DashboardCard>
      </section>
    </div>
  );
}

function formatMeetingTime(m: { startMinutes: number }): string {
  const h = Math.floor(m.startMinutes / 60);
  const mm = m.startMinutes % 60;
  const am = h >= 12;
  const h12 = ((h + 11) % 12) + 1;
  return `${h12}:${mm.toString().padStart(2, "0")} ${am ? "p.m." : "a.m."}`;
}

function CategoryLabel(props: { icon: string; label: string; hint: string }) {
  return (
    <div className="mb-2 flex items-center gap-2">
      <span className="text-lg" aria-hidden>
        {props.icon}
      </span>
      <div>
        <h2 className="text-xs font-bold uppercase tracking-widest text-slate-400">{props.label}</h2>
        <p className="text-[11px] text-slate-600">{props.hint}</p>
      </div>
    </div>
  );
}

function DashboardCard(props: {
  title: string;
  subtitle?: string;
  loading: boolean;
  error?: string;
  children?: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-800 bg-slate-900/70 p-4 shadow-lg shadow-black/20 backdrop-blur md:p-5">
      <div className="mb-3 flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-slate-200">{props.title}</h3>
          {props.subtitle && <p className="mt-0.5 text-xs text-slate-500">{props.subtitle}</p>}
        </div>
        {props.loading && <span className="mt-1 h-2 w-2 shrink-0 animate-pulse rounded-full bg-emerald-400" aria-label="Loading" />}
      </div>
      {props.error ? (
        <div className="rounded-lg border border-rose-900/60 bg-rose-950/30 p-3 text-sm text-rose-200">{props.error}</div>
      ) : props.loading ? (
        <p className="text-sm text-slate-500">Loading…</p>
      ) : (
        props.children
      )}
    </section>
  );
}
