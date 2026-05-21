import type { EnrolledCourse } from "./student-memory";

/** Parse Rutgers course codes from free text (198:111, 01:640:151, CS 112, etc.). */
export function extractCoursesFromText(text: string): EnrolledCourse[] {
  const out: EnrolledCourse[] = [];
  const seen = new Set<string>();

  const patterns = [
    /\b01:(\d{3}):(\d{2,4}[A-Za-z]?)\b/gi,
    /\b(\d{3}):(\d{2,4}[A-Za-z]?)\b/g,
    /\b([A-Za-z]{2,5})\s+(\d{2,4}[A-Za-z]?)\b/g,
  ];

  for (const re of patterns) {
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(text)) !== null) {
      let subject = m[1].replace(/^0+/, "") || m[1];
      const courseNumber = m[2];
      if (/^\d{3}$/.test(subject) || /^[A-Za-z]{2,5}$/i.test(subject)) {
        const key = `${subject}:${courseNumber}`;
        if (!seen.has(key)) {
          seen.add(key);
          out.push({ subject, courseNumber });
        }
      }
    }
  }

  return out;
}

export function mergeCourseLists(...lists: EnrolledCourse[][]): EnrolledCourse[] {
  const seen = new Set<string>();
  const out: EnrolledCourse[] = [];
  for (const list of lists) {
    for (const c of list) {
      const key = `${c.subject}:${c.courseNumber}`;
      if (!seen.has(key)) {
        seen.add(key);
        out.push(c);
      }
    }
  }
  return out;
}

/** True when the user is asking for the built-in first-year CS template only. */
export function wantsCsFirstYearTemplate(text: string): boolean {
  const t = text.toLowerCase();
  return (
    (/\b(first[- ]?year|freshman|fy)\b/.test(t) && /\b(cs|computer science)\b/.test(t)) ||
    /\bcs\s+first[- ]?year\b/.test(t) ||
    /\bfirst[- ]?year\s+cs\b/.test(t)
  );
}
