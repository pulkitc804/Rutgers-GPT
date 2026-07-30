/**
 * Rutgers Schedule of Classes JSON (sis.rutgers.edu → classes.rutgers.edu).
 */
import { fetchWithGuard, FetchGuardError, readTextCapped } from "../net/http";

/** Primary SOC JSON host (sis.rutgers.edu redirects here). */
export const SOC_JSON_URL = "https://classes.rutgers.edu/soc/api/courses.json";

export type SocTermCode = 0 | 1 | 7 | 9;

export type SocCampusCode = "NB" | "NK" | "CM" | string;

export type SocCourseQuery = {
  year: number;
  term: SocTermCode;
  campus?: SocCampusCode;
  subject: string;
  courseNumber?: string;
  registrationIndex?: string;
  level?: "UG" | "G" | string;
};

export type SocMeetingTime = {
  campusAbbrev?: string;
  campusName?: string;
  meetingDay?: string;
  startTimeMilitary?: string;
  endTimeMilitary?: string;
  roomNumber?: string;
  buildingCode?: string;
  meetingModeDesc?: string;
};

export type SocSection = {
  index: string;
  number: string;
  openStatus?: boolean;
  instructorsText?: string;
  meetingTimes: SocMeetingTime[];
  courseString?: string;
};

export type SocCourse = {
  title: string;
  courseString: string;
  subject: string;
  courseNumber: string;
  credits?: number;
  sections: SocSection[];
};

export type NormalizedMeeting = {
  courseString: string;
  title: string;
  sectionIndex: string;
  sectionNumber: string;
  instructor?: string;
  dayCode: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  room?: string;
  campusAbbrev?: string;
};

const DAY_MAP: Record<string, number> = {
  U: 0,
  M: 1,
  T: 2,
  W: 3,
  H: 4,
  F: 5,
  S: 6,
};

function militaryToMinutes(m?: string): number | null {
  if (!m || m.length < 3) return null;
  const clean = m.replace(/\D/g, "");
  if (clean.length < 3) return null;
  const padded = clean.length === 3 ? `0${clean}` : clean.slice(-4);
  const hh = parseInt(padded.slice(0, 2), 10);
  const mm = parseInt(padded.slice(2, 4), 10);
  if (Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return hh * 60 + mm;
}

export function normalizeMeetings(course: SocCourse): NormalizedMeeting[] {
  const out: NormalizedMeeting[] = [];
  for (const sec of course.sections ?? []) {
    for (const mt of sec.meetingTimes ?? []) {
      if (!mt.meetingDay) continue;
      const dayOfWeek = DAY_MAP[mt.meetingDay];
      if (dayOfWeek == null) continue;
      const start = militaryToMinutes(mt.startTimeMilitary);
      const end = militaryToMinutes(mt.endTimeMilitary);
      if (start == null) continue;
      out.push({
        courseString: course.courseString,
        title: course.title,
        sectionIndex: sec.index,
        sectionNumber: sec.number,
        instructor: sec.instructorsText,
        dayCode: mt.meetingDay,
        dayOfWeek,
        startMinutes: start,
        endMinutes: end ?? start + 50,
        room: mt.roomNumber ? `${mt.buildingCode ?? ""} ${mt.roomNumber}`.trim() : mt.buildingCode,
        campusAbbrev: mt.campusAbbrev,
      });
    }
  }
  return out;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export function nextOccurrence(m: NormalizedMeeting, now = new Date()): Date {
  const todayDow = now.getDay();
  const add = (m.dayOfWeek - todayDow + 7) % 7;
  const d = addDays(now, add);
  d.setHours(Math.floor(m.startMinutes / 60), m.startMinutes % 60, 0, 0);
  if (d <= now) d.setDate(d.getDate() + 7);
  return d;
}

export const AcademicService = {
  buildQueryString(q: SocCourseQuery): string {
    const p = new URLSearchParams({
      year: String(q.year),
      term: String(q.term),
      subject: q.subject,
    });
    if (q.campus) p.set("campus", q.campus);
    if (q.courseNumber) p.set("courseNumber", q.courseNumber);
    if (q.registrationIndex) p.set("registrationIndex", q.registrationIndex);
    if (q.level) p.set("level", q.level);
    return p.toString();
  },

  filterCoursesToQuery(data: SocCourse[], q: SocCourseQuery): SocCourse[] {
    return data.filter(
      (c) =>
        String(c.subject) === String(q.subject) &&
        (!q.courseNumber || String(c.courseNumber) === String(q.courseNumber)),
    );
  },

  async fetchCourses(q: SocCourseQuery): Promise<SocCourse[]> {
    const qs = this.buildQueryString(q);
    try {
      const res = await fetchWithGuard(`${SOC_JSON_URL}?${qs}`, {
        label: "SOC",
        timeoutMs: 10_000,
        retries: 2,
        credentials: "omit",
        redirect: "follow",
        headers: {
          Accept: "application/json",
          "User-Agent": "RutgersGPT/1.0 (SOC schedule planner; +https://rutgers.edu)",
        },
      });
      if (!res.ok) throw new Error(`SOC request failed: ${res.status}`);
      // SOC returns the entire campus/term catalog (filtered below), which is large.
      const data = JSON.parse(await readTextCapped(res, 64_000_000, "SOC")) as SocCourse[];
      if (!Array.isArray(data)) throw new Error("SOC response was not a course array");
      return this.filterCoursesToQuery(data, q);
    } catch (e) {
      if (e instanceof FetchGuardError && e.timedOut) {
        throw new Error("SOC request timed out — try again or open SOC in your browser");
      }
      throw e;
    }
  },

  socCourseWebUrl(q: SocCourseQuery): string {
    const p = new URLSearchParams({
      year: String(q.year),
      term: String(q.term),
      subject: q.subject,
    });
    if (q.campus) p.set("campus", q.campus);
    if (q.courseNumber) p.set("courseNumber", q.courseNumber);
    if (q.level) p.set("level", q.level);
    return `https://sims.rutgers.edu/soc/#${p.toString()}`;
  },

  findNextMeeting(courses: SocCourse[], now = new Date()): NormalizedMeeting | null {
    const meetings = courses.flatMap(normalizeMeetings);
    if (!meetings.length) return null;
    let best: { m: NormalizedMeeting; at: Date } | null = null;
    for (const m of meetings) {
      const at = nextOccurrence(m, now);
      if (!best || at < best.at) best = { m, at };
    }
    return best?.m ?? null;
  },
};
