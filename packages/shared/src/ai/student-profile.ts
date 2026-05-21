import type { EnrolledCourse, RutgersPersistentMemory, RutgersStudentMemory } from "./student-memory";
import { formatStudentMemoryBlock } from "./student-memory";
import { NB_SOC_CAMPUS_CODE, type NbSubcampus } from "./nb-scope";
import { DEFAULT_DINING_LOCATIONS } from "../services/DiningService";

/** Local-only student prefs (from Zustand / campus settings) — never credentials. */
export type RutgersStudentProfile = {
  displayName?: string;
  favoriteStopId?: string;
  demoSubject?: string;
  demoCourseNumber?: string;
  diningLocationId?: string;
  /** Always New Brunswick for SOC (agent scope) */
  campus?: typeof NB_SOC_CAMPUS_CODE;
  nbSubcampus?: NbSubcampus;
  major?: string;
  enrolledCourses?: EnrolledCourse[];
  secondaryStopIds?: string[];
  persistentMemory?: RutgersPersistentMemory;
};

export function profileToStudentMemory(p: RutgersStudentProfile | undefined): Partial<RutgersStudentMemory> | undefined {
  if (!p) return undefined;
  return {
    campus: NB_SOC_CAMPUS_CODE,
    major: p.major ?? "",
    enrolledCourses: p.enrolledCourses ?? [],
    secondaryStopIds: p.secondaryStopIds ?? [],
    persistent: p.persistentMemory ?? { facts: [] },
  };
}

export function formatStudentProfileBlock(profile: RutgersStudentProfile | undefined): string {
  if (!profile) return "";
  const lines: string[] = ["Student profile (device-local preferences — not verified identity):"];
  if (profile.displayName?.trim()) lines.push(`- Name to use: ${profile.displayName.trim()}`);
  if (profile.favoriteStopId?.trim()) lines.push(`- Favorite Passio stop ID: ${profile.favoriteStopId.trim()}`);
  if (profile.demoSubject?.trim() && profile.demoCourseNumber?.trim()) {
    lines.push(`- Quick-track course: ${profile.demoSubject.trim()} ${profile.demoCourseNumber.trim()}`);
  }
  if (profile.diningLocationId?.trim()) {
    const preset =
      DEFAULT_DINING_LOCATIONS.find((d) => d.id === profile.diningLocationId?.trim()) ??
      DEFAULT_DINING_LOCATIONS[0];
    lines.push(`- Dining hall: ${preset.label} (${preset.campus} campus, FoodPro location ${preset.locationNum})`);
  }
  if (profile.nbSubcampus) lines.push(`- Home campus (New Brunswick): ${profile.nbSubcampus}`);
  lines.push(`- University scope: Rutgers–New Brunswick (SOC campus ${NB_SOC_CAMPUS_CODE})`);
  if (profile.major?.trim()) lines.push(`- Major: ${profile.major.trim()}`);
  if (profile.enrolledCourses?.length) {
    lines.push(
      `- Course list: ${profile.enrolledCourses.map((c) => `${c.subject}:${c.courseNumber}`).join(", ")}`,
    );
  }
  if (profile.secondaryStopIds?.length) {
    lines.push(`- Secondary stops: ${profile.secondaryStopIds.join(", ")}`);
  }
  if (profile.persistentMemory?.facts?.length) {
    for (const f of profile.persistentMemory.facts.slice(-16)) {
      const t = f.trim();
      if (t) lines.push(`- Remembered: ${t}`);
    }
  }
  if (lines.length === 1) return "";
  return lines.join("\n");
}
