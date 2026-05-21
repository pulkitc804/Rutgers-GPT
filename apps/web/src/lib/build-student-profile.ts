import type { RutgersIQStoreHook } from "@rutgers-gpt/shared";
import { parseCourseList } from "@rutgers-gpt/shared";
import type { RutgersStudentProfile } from "@rutgers-gpt/shared/ai/student-profile";

/** Build API payload from persisted Zustand store. */
export function buildStudentProfileFromStore(useStore: RutgersIQStoreHook): RutgersStudentProfile {
  const s = useStore.getState();
  const secondaryStopIds = s.secondaryStopIdsRaw
    .split(/[,;\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  return {
    displayName: s.displayName || undefined,
    favoriteStopId: s.favoriteStopId,
    demoSubject: s.demoSubject,
    demoCourseNumber: s.demoCourseNumber,
    diningLocationId: s.diningLocationId,
    campus: "NB",
    nbSubcampus: s.nbSubcampus,
    major: s.major || undefined,
    enrolledCourses: parseCourseList(s.enrolledCoursesRaw),
    secondaryStopIds,
    persistentMemory: {
      facts: s.memoryFacts,
      updatedAt: new Date().toISOString(),
    },
  };
}
