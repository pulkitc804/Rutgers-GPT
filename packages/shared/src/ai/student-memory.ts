/** Persistent local memory synced to the agent each chat (no credentials). */

import type { NbSubcampus } from "./nb-scope";

export type EnrolledCourse = {
  subject: string;
  courseNumber: string;
};

export type RutgersPersistentMemory = {
  /** Freeform facts the student asked to remember across sessions */
  facts: string[];
  updatedAt?: string;
};

export type RutgersStudentMemory = {
  campus: "NB";
  nbSubcampus?: NbSubcampus;
  major: string;
  /** e.g. ["198:111","640:151"] */
  enrolledCourses: EnrolledCourse[];
  /** Extra Passio stop IDs for usual routes */
  secondaryStopIds: string[];
  persistent: RutgersPersistentMemory;
};

export function parseCourseList(raw: string): EnrolledCourse[] {
  const out: EnrolledCourse[] = [];
  for (const part of raw.split(/[,;\n]+/)) {
    const t = part.trim();
    if (!t) continue;
    const m = t.match(/^(\d{3}|[A-Za-z]{2,4})\s*[:#\-\s]?\s*(\d{2,4}[A-Za-z]?)$/);
    if (m) {
      out.push({ subject: m[1].replace(/^0+/, "") || m[1], courseNumber: m[2] });
      continue;
    }
    const sp = t.split(/\s+/);
    if (sp.length >= 2) {
      out.push({ subject: sp[0].replace(/^0+/, "") || sp[0], courseNumber: sp[1] });
    }
  }
  return out;
}

export function serializeCourseList(courses: EnrolledCourse[]): string {
  return courses.map((c) => `${c.subject}:${c.courseNumber}`).join(", ");
}

export function formatPersistentMemoryBlock(memory: RutgersPersistentMemory | undefined): string {
  if (!memory?.facts?.length) return "";
  const lines = ["Persistent memory (student asked to remember across sessions):"];
  for (const f of memory.facts.slice(-24)) {
    const t = f.trim();
    if (t) lines.push(`- ${t}`);
  }
  return lines.join("\n");
}

export function formatStudentMemoryBlock(mem: Partial<RutgersStudentMemory> | undefined): string {
  if (!mem) return "";
  const lines: string[] = ["Student memory & profile:"];
  if (mem.nbSubcampus) lines.push(`- Home campus (New Brunswick): ${mem.nbSubcampus}`);
  if (mem.major?.trim()) lines.push(`- Major / program: ${mem.major.trim()}`);
  if (mem.enrolledCourses?.length) {
    lines.push(
      `- Enrolled / planned courses: ${mem.enrolledCourses.map((c) => `${c.subject}:${c.courseNumber}`).join(", ")}`,
    );
  }
  if (mem.secondaryStopIds?.length) {
    lines.push(`- Usual bus stops (Passio IDs): ${mem.secondaryStopIds.join(", ")}`);
  }
  const pm = formatPersistentMemoryBlock(mem.persistent);
  if (pm) lines.push(pm);
  if (lines.length === 1) return "";
  return lines.join("\n");
}
