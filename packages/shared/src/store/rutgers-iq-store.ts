import { createJSONStorage, persist, type StateStorage, type PersistStorage } from "zustand/middleware";
import { create } from "zustand";
import {
  parseCourseList,
  serializeCourseList,
  type EnrolledCourse,
} from "../ai/student-memory";
import { normalizeNbSubcampus, type NbSubcampus } from "../ai/nb-scope";

export type RutgersIQPreferences = {
  favoriteStopId: string;
  demoSubject: string;
  demoCourseNumber: string;
  diningLocationId: string;
  displayName: string;
  lastInsight: string | null;
  /** Home sub-campus within New Brunswick */
  nbSubcampus: NbSubcampus;
  major: string;
  /** Serialized course list e.g. 198:111,640:151 */
  enrolledCoursesRaw: string;
  /** Comma-separated extra Passio stop IDs */
  secondaryStopIdsRaw: string;
  /** Facts remembered across chat sessions (local only) */
  memoryFacts: string[];
};

export type RutgersIQActions = {
  setFavoriteStopId: (id: string) => void;
  setDemoCourse: (subject: string, courseNumber: string) => void;
  setDiningLocationId: (id: string) => void;
  setDisplayName: (name: string) => void;
  setLastInsight: (text: string | null) => void;
  setNbSubcampus: (nbSubcampus: NbSubcampus) => void;
  setMajor: (major: string) => void;
  setEnrolledCoursesRaw: (raw: string) => void;
  setSecondaryStopIdsRaw: (raw: string) => void;
  addMemoryFact: (fact: string) => void;
  removeMemoryFact: (index: number) => void;
  getEnrolledCourses: () => EnrolledCourse[];
};

export type RutgersIQState = RutgersIQPreferences & RutgersIQActions;

const defaults: RutgersIQPreferences = {
  favoriteStopId: "10035",
  demoSubject: "198",
  demoCourseNumber: "112",
  diningLocationId: "atrium",
  displayName: "",
  lastInsight: null,
  nbSubcampus: "College Avenue",
  major: "Computer Science",
  enrolledCoursesRaw: "198:111,640:151,355:101",
  secondaryStopIdsRaw: "",
  memoryFacts: [],
};

function memoryStorage(): StateStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (name) => mem.get(name) ?? null,
    setItem: (name, value) => void mem.set(name, value),
    removeItem: (name) => void mem.delete(name),
  };
}

export function createDefaultWebStorage(): StateStorage {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    return createJSONStorage(() => localStorage) as unknown as StateStorage;
  }
  return memoryStorage();
}

type PersistedV1 = Partial<RutgersIQPreferences>;

function partializePreferences(state: RutgersIQState): RutgersIQPreferences {
  return {
    favoriteStopId: state.favoriteStopId,
    demoSubject: state.demoSubject,
    demoCourseNumber: state.demoCourseNumber,
    diningLocationId: state.diningLocationId,
    displayName: state.displayName,
    lastInsight: state.lastInsight,
    nbSubcampus: state.nbSubcampus,
    major: state.major,
    enrolledCoursesRaw: state.enrolledCoursesRaw,
    secondaryStopIdsRaw: state.secondaryStopIdsRaw,
    memoryFacts: state.memoryFacts,
  };
}

export function createRutgersIQStore(storage?: StateStorage) {
  const st = (storage ?? createDefaultWebStorage()) as unknown as PersistStorage<RutgersIQPreferences>;
  return create<RutgersIQState>()(
    persist(
      (set, get) => ({
        ...defaults,
        setFavoriteStopId: (favoriteStopId) => set({ favoriteStopId }),
        setDemoCourse: (demoSubject, demoCourseNumber) => set({ demoSubject, demoCourseNumber }),
        setDiningLocationId: (diningLocationId) => set({ diningLocationId }),
        setDisplayName: (displayName) => set({ displayName }),
        setLastInsight: (lastInsight) => set({ lastInsight }),
        setNbSubcampus: (nbSubcampus) => set({ nbSubcampus }),
        setMajor: (major) => set({ major }),
        setEnrolledCoursesRaw: (enrolledCoursesRaw) => set({ enrolledCoursesRaw }),
        setSecondaryStopIdsRaw: (secondaryStopIdsRaw) => set({ secondaryStopIdsRaw }),
        addMemoryFact: (fact) => {
          const t = fact.trim();
          if (!t) return;
          set((s) => ({
            memoryFacts: [...s.memoryFacts.filter((x) => x !== t), t].slice(-32),
          }));
        },
        removeMemoryFact: (index) =>
          set((s) => ({
            memoryFacts: s.memoryFacts.filter((_, i) => i !== index),
          })),
        getEnrolledCourses: () => parseCourseList(get().enrolledCoursesRaw),
      }),
      {
        name: "rutgers-iq",
        version: 3,
        storage: st,
        partialize: partializePreferences,
        migrate: (persisted, version) => {
          const p = persisted as PersistedV1 & { campus?: string; nbSubcampus?: NbSubcampus };
          let nbSubcampus = normalizeNbSubcampus(p.nbSubcampus);
          if (version < 3 && (p.campus === "NK" || p.campus === "CM")) {
            nbSubcampus = "College Avenue";
          }
          const base: RutgersIQPreferences = {
            ...defaults,
            favoriteStopId: p.favoriteStopId ?? defaults.favoriteStopId,
            demoSubject: p.demoSubject ?? defaults.demoSubject,
            demoCourseNumber: p.demoCourseNumber ?? defaults.demoCourseNumber,
            diningLocationId: p.diningLocationId ?? defaults.diningLocationId,
            displayName: p.displayName ?? defaults.displayName,
            lastInsight: p.lastInsight ?? defaults.lastInsight,
            nbSubcampus,
            major: p.major ?? defaults.major,
            enrolledCoursesRaw:
              p.enrolledCoursesRaw ??
              (p.demoSubject && p.demoCourseNumber
                ? `${p.demoSubject}:${p.demoCourseNumber}`
                : defaults.enrolledCoursesRaw),
            secondaryStopIdsRaw: p.secondaryStopIdsRaw ?? "",
            memoryFacts: p.memoryFacts ?? [],
          };
          return base;
        },
        merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
      },
    ),
  );
}

export type RutgersIQStoreHook = ReturnType<typeof createRutgersIQStore>;

export { parseCourseList, serializeCourseList };
