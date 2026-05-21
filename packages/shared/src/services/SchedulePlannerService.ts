import {
  AcademicService,
  normalizeMeetings,
  type NormalizedMeeting,
  type SocCourse,
  type SocCourseQuery,
  type SocTermCode,
} from "./AcademicService";
import type { PlannerCourseTarget } from "../ai/planner-types";

export type PlannerSectionOption = {
  courseString: string;
  title: string;
  sectionIndex: string;
  sectionNumber: string;
  openStatus: boolean;
  instructor?: string;
  meetings: {
    day: string;
    start: string;
    end: string;
    room?: string;
    campus?: string;
  }[];
  /** Used for conflict detection */
  meetingsRaw: NormalizedMeeting[];
};

export type PlannerCourseResult = {
  target: PlannerCourseTarget;
  query: SocCourseQuery;
  found: boolean;
  error?: string;
  totalSections: number;
  openSections: number;
  sampleSections: PlannerSectionOption[];
};

export type WeeklyBlock = {
  day: string;
  start: string;
  end: string;
  course: string;
  section: string;
  room?: string;
};

export type FeasiblePlan = {
  label: string;
  totalCredits: number;
  blocks: WeeklyBlock[];
  warnings: string[];
};

const DAY_NAMES: Record<string, string> = {
  U: "Sun",
  M: "Mon",
  T: "Tue",
  W: "Wed",
  H: "Thu",
  F: "Fri",
  S: "Sat",
};

function formatMinutes(m: number): string {
  const h = Math.floor(m / 60);
  const min = m % 60;
  const ap = h >= 12 ? "PM" : "AM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${min.toString().padStart(2, "0")} ${ap}`;
}

function meetingsOverlap(a: NormalizedMeeting, b: NormalizedMeeting): boolean {
  if (a.dayOfWeek !== b.dayOfWeek) return false;
  return a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

function sectionToOption(course: SocCourse, sectionIndex: string): PlannerSectionOption | null {
  const sec = course.sections?.find((s) => s.index === sectionIndex);
  if (!sec) return null;
  const meetingsRaw = normalizeMeetings({ ...course, sections: [sec] });
  return {
    courseString: course.courseString,
    title: course.title,
    sectionIndex: sec.index,
    sectionNumber: sec.number,
    openStatus: sec.openStatus !== false,
    instructor: sec.instructorsText,
    meetingsRaw,
    meetings: meetingsRaw.map((m) => ({
      day: DAY_NAMES[m.dayCode] ?? m.dayCode,
      start: formatMinutes(m.startMinutes),
      end: formatMinutes(m.endMinutes),
      room: m.room,
      campus: m.campusAbbrev,
    })),
  };
}

function pickFeasiblePlan(results: PlannerCourseResult[]): FeasiblePlan | null {
  const picks: { result: PlannerCourseResult; section: PlannerSectionOption }[] = [];

  for (const r of results) {
    if (!r.found || !r.sampleSections.length) continue;
    const open = r.sampleSections.filter((s) => s.openStatus);
    const pool = open.length ? open : r.sampleSections;
    let chosen: PlannerSectionOption | null = null;

    for (const sec of pool.slice(0, 20)) {
      const conflicts = picks.some((p) =>
        p.section.meetingsRaw.some((pm) =>
          sec.meetingsRaw.some((nm) => meetingsOverlap(pm, nm)),
        ),
      );
      if (!conflicts) {
        chosen = sec;
        break;
      }
    }

    if (!chosen) continue;
    picks.push({ result: r, section: chosen });
  }

  if (!picks.length) return null;

  const blocks: WeeklyBlock[] = [];
  const order = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  for (const p of picks) {
    const sec = p.section;
    for (const m of sec.meetings) {
      blocks.push({
        day: m.day,
        start: m.start,
        end: m.end,
        course: `${p.result.target.subject}:${p.result.target.courseNumber} ${p.result.target.title}`,
        section: `#${sec.sectionNumber} (index ${sec.sectionIndex})`,
        room: m.room,
      });
    }
  }
  blocks.sort((a, b) => order.indexOf(a.day) - order.indexOf(b.day) || a.start.localeCompare(b.start));

  const totalCredits = picks.reduce((s, p) => s + p.result.target.credits, 0);
  const warnings: string[] = [];
  if (picks.length < results.filter((r) => r.found).length) {
    warnings.push("Could not place every course without time conflicts — try alternate sections in SOC.");
  }

  return {
    label: "Sample conflict-aware skeleton (verify in Course Schedule Planner)",
    totalCredits,
    blocks,
    warnings,
  };
}

export const SchedulePlannerService = {
  async fetchCourseForTerm(
    target: PlannerCourseTarget,
    year: number,
    term: SocTermCode,
    campus = "NB",
  ): Promise<PlannerCourseResult> {
    const query: SocCourseQuery = {
      year,
      term,
      campus,
      subject: target.subject,
      courseNumber: target.courseNumber,
      level: "UG",
    };
    try {
      const courses = await AcademicService.fetchCourses(query);
      if (!courses.length) {
        return {
          target,
          query,
          found: false,
          error: "No sections returned from SOC for this term — catalog may not be published yet.",
          totalSections: 0,
          openSections: 0,
          sampleSections: [],
        };
      }

      const course = courses[0];
      const sampleSections: PlannerSectionOption[] = [];
      for (const sec of (course.sections ?? []).slice(0, 15)) {
        const opt = sectionToOption(course, sec.index);
        if (opt) sampleSections.push(opt);
      }

      const openSections = (course.sections ?? []).filter((s) => s.openStatus !== false).length;

      return {
        target,
        query,
        found: true,
        totalSections: course.sections?.length ?? 0,
        openSections,
        sampleSections,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "SOC fetch failed";
      return {
        target,
        query,
        found: false,
        error: msg,
        totalSections: 0,
        openSections: 0,
        sampleSections: [],
      };
    }
  },

  async planFirstYearCsTerm(params: {
    year: number;
    term: SocTermCode;
    campus?: string;
    semester?: "fall" | "spring";
  }): Promise<{
    year: number;
    term: SocTermCode;
    termLabel: string;
    campus: string;
    courses: PlannerCourseResult[];
    feasiblePlan: FeasiblePlan | null;
    studentBrief: string;
    degreeNavigatorUrl: string;
    socUrl: string;
    plannerUrl: string;
    disclaimer: string;
  }> {
    const { CS_FIRST_YEAR_FALL_NB, CS_FIRST_YEAR_SPRING_NB } = await import("../ai/cs-first-year-nb");
    const targets =
      params.semester === "spring" ? CS_FIRST_YEAR_SPRING_NB : CS_FIRST_YEAR_FALL_NB;
    const campus = params.campus ?? "NB";

    const courses = await Promise.all(
      targets.map((t) => this.fetchCourseForTerm(t, params.year, params.term, campus)),
    );

    const feasiblePlan = pickFeasiblePlan(courses);

    const termLabel =
      params.term === 9 ? "Fall" : params.term === 1 ? "Spring" : params.term === 7 ? "Summer" : `Term ${params.term}`;

    const studentBrief = formatPlanStudentBrief({
      year: params.year,
      termLabel,
      campus,
      courses,
      feasiblePlan,
      planLabel: "First-year CS template (optional preset)",
      majorLabel: "Computer Science",
      socUrl: `https://sis.rutgers.edu/soc/`,
      plannerUrl: "https://sims.rutgers.edu/webreg/",
      disclaimer:
        "Template only — confirm SAS CS requirements in Degree Navigator. For other majors, list your courses in Agent Memory.",
    });

    return {
      year: params.year,
      term: params.term,
      termLabel,
      campus,
      courses,
      feasiblePlan,
      studentBrief,
      degreeNavigatorUrl: "https://dn.rutgers.edu/",
      socUrl: `https://sis.rutgers.edu/soc/`,
      plannerUrl: "https://sims.rutgers.edu/webreg/",
      disclaimer:
        "Template only — confirm SAS CS requirements in Degree Navigator.",
    };
  },

  /**
   * Universal term planner — any major, any course list (double/triple major = one combined list).
   */
  async planCustomCourses(params: {
    year: number;
    term: SocTermCode;
    campus?: string;
    courses: { subject: string; courseNumber: string; title?: string; credits?: number }[];
    planLabel?: string;
    majorLabel?: string;
  }) {
    const campus = params.campus ?? "NB";
    const targets: PlannerCourseTarget[] = params.courses.map((c) => ({
      subject: c.subject,
      courseNumber: c.courseNumber,
      title: c.title ?? `${c.subject}:${c.courseNumber}`,
      credits: c.credits ?? 3,
      priority: "required" as const,
    }));

    const courseResults = await Promise.all(
      targets.map((t) => this.fetchCourseForTerm(t, params.year, params.term, campus)),
    );
    const feasiblePlan = pickFeasiblePlan(courseResults);
    const termLabel =
      params.term === 9 ? "Fall" : params.term === 1 ? "Spring" : params.term === 7 ? "Summer" : `Term ${params.term}`;

    const studentBrief = formatPlanStudentBrief({
      year: params.year,
      termLabel,
      campus,
      courses: courseResults,
      feasiblePlan,
      planLabel: params.planLabel ?? "Your courseload",
      majorLabel: params.majorLabel,
      socUrl: `https://sis.rutgers.edu/soc/`,
      plannerUrl: "https://sims.rutgers.edu/webreg/",
      disclaimer:
        "SOC-backed advisory plan. Verify prerequisites, degree requirements (including double/triple majors), and cross-campus travel in Degree Navigator.",
    });

    return {
      year: params.year,
      term: params.term,
      termLabel,
      campus,
      courses: courseResults,
      feasiblePlan,
      studentBrief,
      degreeNavigatorUrl: "https://dn.rutgers.edu/",
      socUrl: `https://sis.rutgers.edu/soc/`,
      plannerUrl: "https://sims.rutgers.edu/webreg/",
    };
  },
};

function formatPlanStudentBrief(p: {
  year: number;
  termLabel: string;
  campus: string;
  courses: PlannerCourseResult[];
  feasiblePlan: FeasiblePlan | null;
  planLabel: string;
  majorLabel?: string;
  socUrl: string;
  plannerUrl: string;
  disclaimer: string;
}): string {
  const majorNote = p.majorLabel?.trim() ? ` · ${p.majorLabel.trim()}` : "";
  const lines: string[] = [
    `### ${p.termLabel} ${p.year} — ${p.planLabel} (${p.campus})${majorNote}`,
    "",
    "**Courses checked in SOC:**",
  ];

  const foundCount = p.courses.filter((c) => c.found).length;
  if (foundCount === 0) {
    lines.push(
      "",
      `> **SOC returned no sections** for ${p.termLabel} ${p.year} (${p.campus}). The planner could not load live SOC data — use the links below. **Do not invent** meeting times or section numbers.`,
      "",
    );
  }

  for (const c of p.courses) {
    const code = `${c.target.subject}:${c.target.courseNumber}`;
    const title =
      c.target.title && c.target.title !== code ? c.target.title : "See SOC for title";
    const socLink = AcademicService.socCourseWebUrl(c.query);
    if (!c.found) {
      lines.push(
        `- **${code}** — ${title} — *SOC unavailable*${c.error ? `: ${c.error}` : ""} · [Open in SOC](${socLink})`,
      );
      continue;
    }
    lines.push(
      `- **${code}** — ${title} (${c.target.credits} cr) — ${c.openSections}/${c.totalSections} sections open · [SOC](${socLink})`,
    );
    const best = c.sampleSections.find((s) => s.openStatus) ?? c.sampleSections[0];
    if (best?.meetings.length) {
      const times = best.meetings.map((m) => `${m.day} ${m.start}–${m.end}${m.room ? ` @ ${m.room}` : ""}`).join("; ");
      lines.push(`  - Example section **#${best.sectionNumber}** (index ${best.sectionIndex}): ${times}`);
    }
  }

  if (p.feasiblePlan?.blocks.length) {
    lines.push("", `### Sample weekly grid (${p.feasiblePlan.totalCredits} credits, no overlaps in this pick)`);
    for (const b of p.feasiblePlan.blocks) {
      lines.push(`- **${b.day}** ${b.start}–${b.end}: ${b.course} (sec ${b.section})${b.room ? ` · ${b.room}` : ""}`);
    }
    if (p.feasiblePlan.warnings.length) {
      lines.push("", "**Warnings:**", ...p.feasiblePlan.warnings.map((w) => `- ${w}`));
    }
  }

  lines.push(
    "",
    "### Register (you do this)",
    `1. Build your real schedule in [Course Schedule Planner](${p.plannerUrl}) using section **index** numbers from [SOC](${p.socUrl}).`,
    "2. Confirm requirements in [Degree Navigator](https://dn.rutgers.edu/) — especially for double/triple majors and prerequisites.",
    "3. Typical load is **12–17 credits**; adjust with your advisor if stacking multiple majors.",
    "",
    `_${p.disclaimer}_`,
  );

  return lines.join("\n");
}
