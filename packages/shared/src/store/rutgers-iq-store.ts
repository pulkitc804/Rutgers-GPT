import { createJSONStorage, persist, type StateStorage, type PersistStorage } from "zustand/middleware";
import { create } from "zustand";

export type RutgersIQPreferences = {
  favoriteStopId: string;
  demoSubject: string;
  demoCourseNumber: string;
  /** Dining hall preset id (see DEFAULT_DINING_LOCATIONS) */
  diningLocationId: string;
  /** Optional first name — local only, never sent to model as credential */
  displayName: string;
  lastInsight: string | null;
};

export type RutgersIQActions = {
  setFavoriteStopId: (id: string) => void;
  setDemoCourse: (subject: string, courseNumber: string) => void;
  setDiningLocationId: (id: string) => void;
  setDisplayName: (name: string) => void;
  setLastInsight: (text: string | null) => void;
};

export type RutgersIQState = RutgersIQPreferences & RutgersIQActions;

const defaults: RutgersIQPreferences = {
  favoriteStopId: "10035",
  demoSubject: "198",
  demoCourseNumber: "112",
  diningLocationId: "atrium",
  displayName: "",
  lastInsight: null,
};

function memoryStorage(): StateStorage {
  const mem = new Map<string, string>();
  return {
    getItem: (name) => mem.get(name) ?? null,
    setItem: (name, value) => void mem.set(name, value),
    removeItem: (name) => void mem.delete(name),
  };
}

/** Prefer localStorage; fall back to in-memory (SSR / React Native without AsyncStorage wiring). */
export function createDefaultWebStorage(): StateStorage {
  if (typeof window !== "undefined" && typeof localStorage !== "undefined") {
    return createJSONStorage(() => localStorage) as unknown as StateStorage;
  }
  return memoryStorage();
}

export function createRutgersIQStore(storage?: StateStorage) {
  const st = (storage ?? createDefaultWebStorage()) as unknown as PersistStorage<RutgersIQState>;
  return create<RutgersIQState>()(
    persist(
      (set) => ({
        ...defaults,
        setFavoriteStopId: (favoriteStopId) => set({ favoriteStopId }),
        setDemoCourse: (demoSubject, demoCourseNumber) => set({ demoSubject, demoCourseNumber }),
        setDiningLocationId: (diningLocationId) => set({ diningLocationId }),
        setDisplayName: (displayName) => set({ displayName }),
        setLastInsight: (lastInsight) => set({ lastInsight }),
      }),
      {
        name: "rutgers-iq",
        version: 1,
        storage: st,
        merge: (persisted, current) => ({ ...current, ...(persisted as object) }),
      },
    ),
  );
}

export type RutgersIQStoreHook = ReturnType<typeof createRutgersIQStore>;
