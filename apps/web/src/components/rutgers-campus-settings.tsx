"use client";

import type { RutgersIQStoreHook } from "@rutgers-gpt/shared";
import { Button } from "@/components/ui/button";

type Props = { useStore: RutgersIQStoreHook };

const field =
  "flex h-10 w-full rounded-xl border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-zinc-100 shadow-inner placeholder:text-zinc-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#cc0033]/45 focus-visible:ring-offset-0 disabled:cursor-not-allowed disabled:opacity-50";

export function RutgersCampusSettings({ useStore }: Props) {
  const favoriteStopId = useStore((s) => s.favoriteStopId);
  const demoSubject = useStore((s) => s.demoSubject);
  const demoCourseNumber = useStore((s) => s.demoCourseNumber);
  const displayName = useStore((s) => s.displayName);
  const setFavoriteStopId = useStore((s) => s.setFavoriteStopId);
  const setDemoCourse = useStore((s) => s.setDemoCourse);
  const setDisplayName = useStore((s) => s.setDisplayName);

  return (
    <div className="grid gap-4 rounded-2xl border border-white/[0.08] bg-zinc-900/40 p-4 shadow-inner sm:grid-cols-2 lg:grid-cols-4">
      <div className="space-y-2">
        <label htmlFor="displayName" className="text-[13px] font-medium leading-none text-zinc-300">
          What should we call you?
        </label>
        <input
          id="displayName"
          className={field}
          placeholder="First name (optional, stays on this device)"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          autoComplete="nickname"
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="stopId" className="text-[13px] font-medium leading-none text-zinc-300">
          Passio stop ID
        </label>
        <input
          id="stopId"
          className={field}
          inputMode="numeric"
          placeholder="e.g. 10035"
          value={favoriteStopId}
          onChange={(e) => setFavoriteStopId(e.target.value.trim())}
        />
        <p className="text-[11px] text-zinc-500">From the Passio GO map for your stop.</p>
      </div>
      <div className="space-y-2">
        <label htmlFor="subject" className="text-[13px] font-medium leading-none text-zinc-300">
          Course subject
        </label>
        <input
          id="subject"
          className={`${field} uppercase`}
          placeholder="e.g. 198 or CS"
          value={demoSubject}
          onChange={(e) => setDemoCourse(e.target.value.trim().toUpperCase(), demoCourseNumber)}
        />
      </div>
      <div className="space-y-2">
        <label htmlFor="courseNum" className="text-[13px] font-medium leading-none text-zinc-300">
          Course number
        </label>
        <div className="flex gap-2">
          <input
            id="courseNum"
            className={field}
            inputMode="numeric"
            placeholder="e.g. 112"
            value={demoCourseNumber}
            onChange={(e) => setDemoCourse(demoSubject, e.target.value.trim())}
          />
          <Button type="button" variant="outline" size="sm" className="h-10 shrink-0 rounded-xl border-white/12 bg-white/[0.05] text-zinc-200 hover:bg-white/10" asChild>
            <a href="https://sis.rutgers.edu/soc/" target="_blank" rel="noreferrer">
              SOC
            </a>
          </Button>
        </div>
      </div>
    </div>
  );
}
