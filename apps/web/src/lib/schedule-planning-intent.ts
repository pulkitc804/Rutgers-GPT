import { extractCoursesFromText } from "@rutgers-gpt/shared/ai/course-parser";

/** Detect requests that need SOC-backed term planning, not generic link lists. */
export function detectSchedulePlanningIntent(text: string): {
  match: boolean;
  year?: number;
  term?: "fall" | "spring" | "summer";
  coursesInMessage: ReturnType<typeof extractCoursesFromText>;
} {
  const t = text.toLowerCase();
  const coursesInMessage = extractCoursesFromText(text);

  const planning =
    /\b(schedule|course\s*load|courseload|what\s+(classes|courses)|register|planning|pick\s+classes|build\s+a\s+schedule|map\s+out)\b/.test(
      t,
    ) || /\bhelp\s+plan/.test(t) || /\b(double|triple)\s+major/.test(t);

  const academic =
    /\b(fall|spring|summer|semester|freshman|sophomore|junior|senior|major|minor|credit|soc)\b/.test(t) ||
    /\b20\d{2}\b/.test(t) ||
    coursesInMessage.length > 0;

  if (!planning || !academic) return { match: false, coursesInMessage };

  const yearMatch = t.match(/\b(20\d{2})\b/);
  const year = yearMatch ? parseInt(yearMatch[1], 10) : 2026;
  let term: "fall" | "spring" | "summer" = "fall";
  if (/\bspring\b/.test(t)) term = "spring";
  else if (/\bsummer\b/.test(t)) term = "summer";

  return { match: true, year, term, coursesInMessage };
}
