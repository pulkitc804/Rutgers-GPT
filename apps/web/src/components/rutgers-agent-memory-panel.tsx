"use client";

import type { RutgersIQStoreHook } from "@rutgers-gpt/shared";
import { NB_SUBCAMPUSES, type NbSubcampus } from "@rutgers-gpt/shared";
import { Button } from "@/components/ui/button";

const field =
  "flex w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 shadow-inner placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc0033]/45";

type Props = { useStore: RutgersIQStoreHook };

export function RutgersAgentMemoryPanel({ useStore }: Props) {
  const nbSubcampus = useStore((s) => s.nbSubcampus);
  const major = useStore((s) => s.major);
  const enrolledCoursesRaw = useStore((s) => s.enrolledCoursesRaw);
  const secondaryStopIdsRaw = useStore((s) => s.secondaryStopIdsRaw);
  const memoryFacts = useStore((s) => s.memoryFacts);
  const setNbSubcampus = useStore((s) => s.setNbSubcampus);
  const setMajor = useStore((s) => s.setMajor);
  const setEnrolledCoursesRaw = useStore((s) => s.setEnrolledCoursesRaw);
  const setSecondaryStopIdsRaw = useStore((s) => s.setSecondaryStopIdsRaw);
  const removeMemoryFact = useStore((s) => s.removeMemoryFact);

  return (
    <div className="space-y-4 rounded-2xl border border-[#cc0033]/20 bg-zinc-900/50 p-4 shadow-inner">
      <div>
        <h3 className="text-sm font-semibold text-zinc-100">Agent memory</h3>
        <p className="mt-1 text-[11px] leading-relaxed text-zinc-500">
          Rutgers–New Brunswick only. Saved on this device — courses, home campus, bus stops, and pinned facts.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <label htmlFor="nbSubcampus" className="text-[12px] font-medium text-zinc-400">
            Home campus (NB)
          </label>
          <select
            id="nbSubcampus"
            className={field}
            value={nbSubcampus}
            onChange={(e) => setNbSubcampus(e.target.value as NbSubcampus)}
          >
            {NB_SUBCAMPUSES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="major" className="text-[12px] font-medium text-zinc-400">
            Major / program
          </label>
          <input
            id="major"
            className={field}
            value={major}
            onChange={(e) => setMajor(e.target.value)}
            placeholder="e.g. Computer Science"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="courses" className="text-[12px] font-medium text-zinc-400">
          Your courses (comma-separated)
        </label>
        <input
          id="courses"
          className={field}
          value={enrolledCoursesRaw}
          onChange={(e) => setEnrolledCoursesRaw(e.target.value)}
          placeholder="198:111, 640:151, 355:101, 730:101 — add all majors"
        />
        <p className="text-[11px] text-zinc-500">
          All courses for any major(s) in one list — double or triple major supported. Used for live SOC term planning.
        </p>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="stops" className="text-[12px] font-medium text-zinc-400">
          Usual bus stops (Passio IDs)
        </label>
        <input
          id="stops"
          className={field}
          value={secondaryStopIdsRaw}
          onChange={(e) => setSecondaryStopIdsRaw(e.target.value)}
          placeholder="e.g. 10035, 10042"
        />
      </div>
      {memoryFacts.length > 0 && (
        <div className="space-y-2">
          <p className="text-[12px] font-medium text-zinc-400">Remembered facts</p>
          <ul className="space-y-1.5">
            {memoryFacts.map((fact, i) => (
              <li
                key={`${i}-${fact.slice(0, 12)}`}
                className="flex items-start justify-between gap-2 rounded-lg border border-white/[0.06] bg-zinc-950/60 px-2.5 py-2 text-[12px] text-zinc-300"
              >
                <span className="min-w-0 flex-1">{fact}</span>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 shrink-0 px-2 text-[11px] text-zinc-500 hover:text-zinc-200"
                  onClick={() => removeMemoryFact(i)}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
