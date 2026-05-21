import { extractCoursesFromText, mergeCourseLists, wantsCsFirstYearTemplate } from "@rutgers-gpt/shared/ai/course-parser";
import { CS_FIRST_YEAR_FALL_NB, CS_FIRST_YEAR_SPRING_NB } from "@rutgers-gpt/shared/ai/cs-first-year-nb";
import type { PlannerCourseTarget } from "@rutgers-gpt/shared/ai/planner-types";
import type { EnrolledCourse } from "@rutgers-gpt/shared/ai/student-memory";
import { SchedulePlannerService } from "@rutgers-gpt/shared/ai/agent-runtime";
import type { SocTermCode } from "@rutgers-gpt/shared/ai/agent-runtime";
import type { RutgersStudentProfile } from "@rutgers-gpt/shared/ai/student-profile";

function parseTermArg(termStr: string): SocTermCode {
  if (termStr === "spring") return 1;
  if (termStr === "summer") return 7;
  return 9;
}

function templateForTerm(termStr: string): PlannerCourseTarget[] {
  return termStr === "spring" ? CS_FIRST_YEAR_SPRING_NB : CS_FIRST_YEAR_FALL_NB;
}

function coursesOnlyFromTemplate(courses: EnrolledCourse[], template: PlannerCourseTarget[]): boolean {
  if (!courses.length) return false;
  const allowed = new Set(template.map((t) => `${t.subject}:${t.courseNumber}`));
  return courses.every((c) => allowed.has(`${c.subject}:${c.courseNumber}`));
}

function enrichCoursesFromTemplate(
  courses: EnrolledCourse[],
  template: PlannerCourseTarget[],
): { subject: string; courseNumber: string; title?: string; credits?: number }[] {
  return courses.map((c) => {
    const hit = template.find((t) => t.subject === c.subject && t.courseNumber === c.courseNumber);
    return {
      subject: c.subject,
      courseNumber: c.courseNumber,
      title: hit?.title ?? `${c.subject}:${c.courseNumber}`,
      credits: hit?.credits,
    };
  });
}

export async function resolveTermPlan(params: {
  year: number;
  term: string;
  campus?: string;
  courses?: EnrolledCourse[];
  track?: string;
  profile?: RutgersStudentProfile;
  userMessage?: string;
}) {
  const term = parseTermArg(params.term);
  const campus = "NB";
  const majorLabel = params.profile?.major?.trim() || undefined;

  const fromMessage = params.userMessage ? extractCoursesFromText(params.userMessage) : [];
  const courseList = mergeCourseLists(
    params.profile?.enrolledCourses ?? [],
    params.courses ?? [],
    fromMessage,
  );

  const csTemplate = templateForTerm(params.term);
  const wantsCs =
    params.track === "cs-first-year" ||
    (params.userMessage ? wantsCsFirstYearTemplate(params.userMessage) : false);
  const useCsTemplate =
    wantsCs && (courseList.length === 0 || coursesOnlyFromTemplate(courseList, csTemplate));

  if (useCsTemplate) {
    return SchedulePlannerService.planFirstYearCsTerm({
      year: params.year,
      term,
      campus,
      semester: params.term === "spring" ? "spring" : "fall",
    });
  }

  if (!courseList.length) {
    return {
      error:
        "List the courses to plan (e.g. 198:111, 640:151, 355:101) in Agent Memory or in your message. Works for any major including double/triple major — combine all courses in one list.",
      hint: "Open Live campus → Agent memory → Courses",
    };
  }

  const planLabel =
    courseList.length >= 8
      ? "Combined multi-major courseload"
      : courseList.length >= 5
        ? "Full term courseload"
        : "Your term courseload";

  return SchedulePlannerService.planCustomCourses({
    year: params.year,
    term,
    campus,
    courses: enrichCoursesFromTemplate(courseList, csTemplate),
    planLabel,
    majorLabel,
  });
}
