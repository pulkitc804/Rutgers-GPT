import { resolveTermPlan } from "@/lib/resolve-term-plan";
import { lookupRutgersOfficial } from "@/lib/rutgers-web-lookup";
import { formatRagHitsForAgent, searchRutgersKnowledge } from "@/lib/rutgers-rag/search";
import { rerankWithOllamaEmbeddings } from "@/lib/rutgers-rag/embed-ollama";
import {
  AcademicService,
  BusService,
  buildVerifiedDiningSnapshot,
  DEFAULT_DINING_LOCATIONS,
  DiningService,
  EventsService,
  parseMenuHtml,
  PRIMARY_API_SOURCES,
  NB_SOC_CAMPUS_CODE,
  NB_SUBCAMPUSES,
  RUTGERS_AGENT_SCOPE,
  SchedulePlannerService,
  type RutgersStudentProfile,
} from "@rutgers-gpt/shared/ai/agent-runtime";
import type { SocTermCode } from "@rutgers-gpt/shared/ai/agent-runtime";
import type { RutgersAgentToolName } from "@rutgers-gpt/shared/ai/agent-tools";
import type { RutgersInsightContext } from "@rutgers-gpt/shared/ai";

export type ToolRunContext = {
  profile?: RutgersStudentProfile;
  /** Optional pre-fetched snapshot from Live campus panel */
  liveSnapshot?: RutgersInsightContext;
};

const CAMPUS_RESOURCES: Record<string, { title: string; url: string; note?: string }[]> = {
  transit: [
    { title: "Passio GO (live buses)", url: "https://rutgers.passiogo.com/", note: "Primary NB shuttle tracker" },
    { title: "Rutgers Parking & Transportation", url: "https://ipo.rutgers.edu/transportation" },
  ],
  dining: [
    { title: "Rutgers Dining", url: "https://dining.rutgers.edu/" },
    { title: "Retail dining menus", url: "https://food.rutgers.edu/places-eat/retail-dining-menus" },
  ],
  academics: [
    { title: "Schedule of Classes (SOC)", url: "https://sis.rutgers.edu/soc/" },
    { title: "Course Schedule Planner", url: "https://sims.rutgers.edu/webreg/" },
    { title: "Degree Navigator", url: "https://dn.rutgers.edu/" },
    { title: "Canvas", url: "https://canvas.rutgers.edu/" },
    { title: "Learning Centers", url: "https://rlc.rutgers.edu/" },
  ],
  wellness: [
    { title: "CAPS", url: "https://health.rutgers.edu/counseling" },
    { title: "Student Health", url: "https://health.rutgers.edu/" },
    { title: "TimelyCare", url: "https://www.timelycare.com/rutgers" },
  ],
  involvement: [
    { title: "Get Involved (RU)", url: "https://getinvolved.rutgers.edu/" },
    { title: "Career Exploration (NSO)", url: "https://nso.rutgers.edu/" },
  ],
};

function parseTermArg(termStr: string): SocTermCode {
  if (termStr === "spring") return 1;
  if (termStr === "summer") return 7;
  return 9;
}

function inferSocQuery(now: Date, subject: string, courseNumber: string, campus?: string) {
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  const c = NB_SOC_CAMPUS_CODE;
  if (month >= 1 && month <= 5) return { year, term: 1 as const, campus: c, subject, courseNumber };
  if (month >= 6 && month <= 8) return { year, term: 7 as const, campus: c, subject, courseNumber };
  return { year, term: 9 as const, campus: c, subject, courseNumber };
}

export async function runRutgersAgentTool(
  name: RutgersAgentToolName,
  args: Record<string, unknown>,
  ctx: ToolRunContext,
): Promise<string> {
  try {
    switch (name) {
      case "search_rutgers_knowledge": {
        const query = typeof args.query === "string" ? args.query : "";
        const nbSubcampus =
          typeof args.nbSubcampus === "string" ? args.nbSubcampus : ctx.profile?.nbSubcampus;
        const ragQuery = nbSubcampus ? `${query} ${nbSubcampus} New Brunswick` : query;
        let hits = await searchRutgersKnowledge({ query: ragQuery, campus: "NB", limit: 6 });
        hits = await rerankWithOllamaEmbeddings(ragQuery, hits);
        return JSON.stringify(
          {
            query,
            scope: RUTGERS_AGENT_SCOPE,
            nbSubcampus: nbSubcampus ?? null,
            hits: hits.map((h) => ({ title: h.chunk.title, source: h.chunk.source, score: h.score })),
            content: formatRagHitsForAgent(hits),
          },
          null,
          2,
        );
      }
      case "search_rutgers_web": {
        const query = typeof args.query === "string" ? args.query : "";
        if (!query.trim()) return JSON.stringify({ error: "query required" });
        const lookup = await lookupRutgersOfficial(query);
        return JSON.stringify(lookup, null, 2);
      }
      case "get_live_transit": {
        const routeId = typeof args.routeId === "string" ? args.routeId : undefined;
        const stops = new Set<string>();
        if (typeof args.stopId === "string" && args.stopId.trim()) stops.add(args.stopId.trim());
        if (ctx.profile?.favoriteStopId?.trim()) stops.add(ctx.profile.favoriteStopId.trim());
        for (const s of ctx.profile?.secondaryStopIds ?? []) {
          if (s.trim()) stops.add(s.trim());
        }
        if (!stops.size) stops.add("10035");

        const byStop: Record<string, unknown> = {};
        for (const stopId of stops) {
          const etas = await BusService.getStopEtas({ stopId, routeId });
          byStop[stopId] = { next: BusService.pickSoonest(etas), etas: etas.slice(0, 6) };
        }
        return JSON.stringify(
          {
            fetchedAt: new Date().toISOString(),
            primarySource: PRIMARY_API_SOURCES.passio,
            stops: byStop,
            hint: "Passio GO covers Rutgers–New Brunswick inter-campus shuttles (College Ave, Busch, Livingston, Cook/Douglass).",
          },
          null,
          2,
        );
      }
      case "get_dining_menu": {
        const locId =
          (typeof args.locationId === "string" && args.locationId.trim()) ||
          ctx.profile?.diningLocationId?.trim() ||
          "atrium";
        const preset = DEFAULT_DINING_LOCATIONS.find((d) => d.id === locId) ?? DEFAULT_DINING_LOCATIONS[0];
        const html = await DiningService.fetchMenuDocument(preset.menuUrl);
        const parsed = parseMenuHtml(html, preset.label);
        const summary = DiningService.summarizeNextMeal(parsed);
        const verified = buildVerifiedDiningSnapshot(preset, parsed, summary);
        return JSON.stringify(
          {
            fetchedAt: new Date().toISOString(),
            primarySource: PRIMARY_API_SOURCES.diningFoodPro,
            verified,
            menuItems: parsed.stations.filter((s) => s.items.length).slice(0, 12),
            doNotGuessCampus:
              "Campus comes only from the verified preset above — never from model memory (e.g. Atrium is College Avenue, not Livingston or Cook/Douglass).",
          },
          null,
          2,
        );
      }
      case "get_course_schedule": {
        const subject =
          (typeof args.subject === "string" && args.subject.trim()) ||
          ctx.profile?.demoSubject?.trim() ||
          "";
        const courseNumber =
          (typeof args.courseNumber === "string" && args.courseNumber.trim()) ||
          ctx.profile?.demoCourseNumber?.trim() ||
          "";
        if (!subject || !courseNumber) {
          return JSON.stringify({ error: "subject and courseNumber required (or set in campus settings)" });
        }
        const year = typeof args.year === "number" ? args.year : undefined;
        const termArg = typeof args.term === "string" ? args.term : undefined;
        const q =
          year != null && termArg
            ? {
                year,
                term: (termArg === "fall" ? 9 : termArg === "spring" ? 1 : 7) as SocTermCode,
                campus: NB_SOC_CAMPUS_CODE,
                subject,
                courseNumber,
                level: "UG" as const,
              }
            : inferSocQuery(new Date(), subject, courseNumber);
        const courses = await AcademicService.fetchCourses(q);
        const next = AcademicService.findNextMeeting(courses);
        const sections = (courses[0]?.sections ?? []).slice(0, 8).map((sec) => {
          const c = courses[0];
          if (!c) return null;
          const meetings = sec.meetingTimes?.map((mt) => ({
            day: mt.meetingDay,
            start: mt.startTimeMilitary,
            end: mt.endTimeMilitary,
            room: mt.roomNumber ? `${mt.buildingCode ?? ""} ${mt.roomNumber}`.trim() : mt.buildingCode,
            campus: mt.campusAbbrev,
          }));
          return {
            index: sec.index,
            number: sec.number,
            open: sec.openStatus !== false,
            instructor: sec.instructorsText,
            meetings,
          };
        });
        return JSON.stringify(
          {
            query: q,
            fetchedAt: new Date().toISOString(),
            primarySource: PRIMARY_API_SOURCES.soc,
            courseCount: courses.length,
            nextMeeting: next,
            sections,
            courses: courses.slice(0, 2).map((c) => ({
              courseString: c.courseString,
              title: c.title,
              sections: c.sections?.length ?? 0,
            })),
          },
          null,
          2,
        );
      }
      case "plan_term_schedule":
      case "plan_multi_course_schedule": {
        const year = typeof args.year === "number" ? args.year : 2026;
        const termStr = typeof args.term === "string" ? args.term : "fall";
        const argCourses = Array.isArray(args.courses)
          ? args.courses
              .filter((c): c is { subject: string; courseNumber: string } => {
                return !!c && typeof c === "object" && "subject" in c && "courseNumber" in c;
              })
              .map((c) => ({
                subject: String((c as { subject: string }).subject),
                courseNumber: String((c as { courseNumber: string }).courseNumber),
              }))
          : undefined;
        const plan = await resolveTermPlan({
          year,
          term: termStr,
          campus: NB_SOC_CAMPUS_CODE,
          courses: argCourses,
          track: typeof args.track === "string" ? args.track : undefined,
          profile: ctx.profile,
        });
        return JSON.stringify(plan, null, 2);
      }
      case "get_canvas_guidance": {
        const topic = typeof args.topic === "string" ? args.topic : "overview";
        const hits = await searchRutgersKnowledge({ query: `canvas ${topic} rutgers`, limit: 3 });
        return JSON.stringify(
          {
            topic,
            canvasUrl: "https://canvas.rutgers.edu/",
            netidNote: "Login with NetID; agent cannot access your Canvas account.",
            knowledge: formatRagHitsForAgent(hits),
            tips:
              topic === "calendar"
                ? "Export/subscribe to calendar from Canvas course settings; combine with SOC planner."
                : topic === "assignments"
                  ? "Assignments and due dates are per course site — check each course shell."
                  : "Syllabus, modules, and announcements are on each course Canvas page.",
          },
          null,
          2,
        );
      }
      case "get_campus_events": {
        const data = await EventsService.fetchUpcomingEvents(NB_SOC_CAMPUS_CODE);
        return JSON.stringify({ scope: RUTGERS_AGENT_SCOPE, ...data }, null, 2);
      }
      case "get_campus_info": {
        const topic = typeof args.topic === "string" ? args.topic : "overview";
        const nbSubcampus =
          typeof args.nbSubcampus === "string" ? args.nbSubcampus : ctx.profile?.nbSubcampus;
        const hits = await searchRutgersKnowledge({
          query: `New Brunswick ${nbSubcampus ?? ""} ${topic} rutgers`.trim(),
          campus: "NB",
          limit: 5,
        });
        const links = [
          { title: "Rutgers New Brunswick", url: "https://newbrunswick.rutgers.edu/" },
          { title: "Passio GO (NB buses)", url: "https://rutgers.passiogo.com/" },
          { title: "Rutgers Dining", url: "https://food.rutgers.edu/places-eat" },
        ];
        return JSON.stringify(
          {
            scope: RUTGERS_AGENT_SCOPE,
            subcampuses: NB_SUBCAMPUSES,
            nbSubcampus: nbSubcampus ?? null,
            topic,
            links,
            knowledge: formatRagHitsForAgent(hits),
            outOfScopeNote: "Newark and Camden are not supported in this agent yet.",
          },
          null,
          2,
        );
      }
      case "list_campus_resources": {
        const cat = typeof args.category === "string" ? args.category : "all";
        const keys =
          cat === "all"
            ? (Object.keys(CAMPUS_RESOURCES) as (keyof typeof CAMPUS_RESOURCES)[])
            : [cat as keyof typeof CAMPUS_RESOURCES];
        const out: Record<string, typeof CAMPUS_RESOURCES.transit> = {};
        for (const k of keys) {
          if (CAMPUS_RESOURCES[k]) out[k] = CAMPUS_RESOURCES[k];
        }
        const payload = { scope: RUTGERS_AGENT_SCOPE, subcampuses: NB_SUBCAMPUSES, resources: out };
        if (ctx.liveSnapshot) {
          return JSON.stringify({ ...payload, cachedLiveSnapshot: ctx.liveSnapshot }, null, 2);
        }
        return JSON.stringify(payload, null, 2);
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Tool failed";
    return JSON.stringify({ error: msg, tool: name });
  }
}
