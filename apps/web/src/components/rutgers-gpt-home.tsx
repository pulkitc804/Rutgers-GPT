"use client";

import { createRutgersIQStore, RutgersDashboard, type RutgersLiveDataPayload } from "@rutgers-gpt/shared";
import { createWebRutgersTransport } from "@/lib/rutgers-web-transport";
import { RutgersCampusSettings } from "@/components/rutgers-campus-settings";
import { RutgersGptChat } from "@/components/rutgers-gpt-chat";
import { Button } from "@/components/ui/button";
import { AnimatePresence, motion } from "framer-motion";
import { BookOpen, ChevronRight, ExternalLink, Map, MessageSquare, PanelRightClose, PanelRightOpen, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const useRutgersIQStore = createRutgersIQStore();

const SIDEBAR_LINKS = [
  { href: "https://rutgers.passiogo.com/", label: "Passio GO" },
  { href: "https://sis.rutgers.edu/soc/", label: "SOC" },
  { href: "https://canvas.rutgers.edu", label: "Canvas" },
  { href: "https://dining.rutgers.edu", label: "Dining" },
  { href: "https://dn.rutgers.edu", label: "Degree Nav" },
  { href: "https://health.rutgers.edu/counseling", label: "CAPS" },
] as const;

export function RutgersGptHome() {
  const transport = useMemo(() => createWebRutgersTransport(), []);
  const [livePayload, setLivePayload] = useState<RutgersLiveDataPayload | null>(null);
  const onLiveData = useCallback((p: RutgersLiveDataPayload) => setLivePayload(p), []);
  const dashboardRefreshRef = useRef<(() => void) | null>(null);
  const [liveOpen, setLiveOpen] = useState(false);
  const livePanelRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!liveOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setLiveOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [liveOpen]);

  useEffect(() => {
    if (liveOpen) livePanelRef.current?.focus();
  }, [liveOpen]);

  return (
    <div className="rgpt-mesh relative flex h-[100dvh] flex-col overflow-hidden text-zinc-100 md:flex-row">
      <div className="rgpt-vignette absolute inset-0 z-[1]" aria-hidden />
      <div className="rgpt-grain" aria-hidden />

      <aside className="relative z-[2] flex w-full shrink-0 flex-row items-stretch gap-0 border-b border-white/[0.08] bg-zinc-950/55 px-1 py-2 shadow-[inset_-1px_0_0_0_rgba(255,255,255,0.04)] backdrop-blur-2xl md:w-[15.5rem] md:flex-col md:border-b-0 md:border-r md:py-5">
        <div className="flex min-w-0 flex-1 items-center gap-2 px-2 md:flex-col md:items-stretch md:px-3">
          <div className="flex min-w-0 flex-1 items-center gap-3 md:mb-5 md:flex-none md:flex-col md:items-stretch md:gap-0">
            <div className="flex items-center gap-3">
              <div className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[#e0244a] to-[#8f0022] text-sm font-bold tracking-tight text-white shadow-lg shadow-[#cc0033]/25 ring-1 ring-white/20">
                R
                <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-emerald-400" title="App online" />
              </div>
              <div className="min-w-0 md:hidden">
                <p className="truncate bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-sm font-semibold text-transparent">
                  Rutgers GPT
                </p>
                <p className="truncate text-[10px] font-medium uppercase tracking-[0.14em] text-zinc-500">Campus</p>
              </div>
            </div>
            <div className="hidden md:mt-1 md:block">
              <p className="bg-gradient-to-r from-white via-white to-zinc-400 bg-clip-text text-[15px] font-semibold leading-tight tracking-tight text-transparent">
                Rutgers GPT
              </p>
              <p className="mt-1 text-[11px] leading-snug text-zinc-500">Transit, dining, classes — one chat.</p>
            </div>
          </div>

          <Button
            type="button"
            variant="outline"
            className="group mt-1 hidden h-10 justify-start gap-2 rounded-xl border-white/10 bg-white/[0.04] text-sm text-zinc-200 shadow-none ring-0 transition hover:border-[#cc0033]/35 hover:bg-[#cc0033]/12 hover:text-white md:flex"
            onClick={() => setLiveOpen(true)}
          >
            <Map className="h-4 w-4 shrink-0 text-[#ff8fa3] transition group-hover:scale-105" aria-hidden />
            Live campus
            <ChevronRight className="ml-auto h-4 w-4 opacity-40 transition group-hover:translate-x-0.5 group-hover:opacity-80" aria-hidden />
          </Button>

          <div className="mt-3 hidden md:block">
            <p className="mb-1.5 px-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-zinc-600">Shortcuts</p>
            <nav className="max-h-[min(42vh,22rem)] space-y-0.5 overflow-y-auto rgpt-scroll pr-0.5" aria-label="Rutgers links">
              {SIDEBAR_LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  target="_blank"
                  rel="noreferrer"
                  className="group flex items-center gap-2 rounded-xl px-2.5 py-2 text-[13px] text-zinc-400 transition hover:bg-white/[0.06] hover:text-zinc-100"
                >
                  <ExternalLink className="h-3.5 w-3.5 shrink-0 opacity-50 transition group-hover:opacity-90" aria-hidden />
                  <span className="truncate">{l.label}</span>
                </a>
              ))}
            </nav>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1 border-t border-white/[0.06] px-1 pt-2 md:mt-auto md:flex-col md:px-2 md:pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-10 w-10 rounded-xl border-white/10 bg-white/[0.04] text-zinc-300 shadow-none md:hidden"
            onClick={() => setLiveOpen(true)}
            aria-label="Open live campus"
          >
            <Map className="h-4 w-4" />
          </Button>
          <Button
            asChild
            variant="outline"
            size="sm"
            className="hidden w-full justify-center border-white/[0.07] bg-transparent text-[11px] text-zinc-500 shadow-none hover:bg-white/[0.04] hover:text-zinc-300 md:flex"
          >
            <Link href="#">Extension soon</Link>
          </Button>
        </div>
      </aside>

      <div className="relative z-[2] flex min-h-0 min-w-0 flex-1 flex-col">
        <header className="flex h-[52px] shrink-0 items-center justify-between border-b border-white/[0.07] bg-zinc-950/40 px-3 backdrop-blur-xl md:h-14 md:px-6">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-[#ff9eb0]" aria-hidden />
              <span className="text-sm font-semibold tracking-tight text-white">Chat</span>
              <Sparkles className="h-3.5 w-3.5 text-amber-200/70" aria-hidden />
            </div>
            <span className="hidden text-[11px] text-zinc-500 sm:block">Claude-powered · grounded in your live campus panel</span>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="hidden h-9 gap-2 rounded-full border-white/12 bg-white/[0.06] px-4 text-xs font-medium text-zinc-100 shadow-sm hover:border-[#cc0033]/40 hover:bg-[#cc0033]/15 md:inline-flex"
              onClick={() => setLiveOpen(true)}
            >
              <Map className="h-3.5 w-3.5 text-[#ff9eb0]" />
              Live campus
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 rounded-full border-white/12 bg-white/[0.06] px-3 text-xs font-medium text-zinc-100 shadow-sm hover:border-[#cc0033]/40 hover:bg-[#cc0033]/15 md:hidden"
              onClick={() => setLiveOpen(true)}
            >
              <BookOpen className="h-3.5 w-3.5" />
              Live
            </Button>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 md:px-8 md:pb-6 md:pt-5">
          <RutgersGptChat useStore={useRutgersIQStore} live={livePayload} liveConnected={!!livePayload} />
        </main>

        <AnimatePresence>
          {liveOpen && (
            <>
              <motion.button
                type="button"
                aria-label="Close live campus"
                className="absolute inset-0 z-[60] bg-black/70 backdrop-blur-[2px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => setLiveOpen(false)}
              />
              <motion.div
                ref={livePanelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="live-campus-title"
                tabIndex={-1}
                className="absolute inset-y-0 right-0 z-[70] flex w-full max-w-lg flex-col border-l border-white/[0.08] bg-zinc-950/95 shadow-[-24px_0_48px_-12px_rgba(0,0,0,0.6)] outline-none backdrop-blur-2xl md:max-w-xl"
                initial={{ x: "104%" }}
                animate={{ x: 0 }}
                exit={{ x: "104%" }}
                transition={{ type: "spring", stiffness: 420, damping: 38, mass: 0.7 }}
              >
                <div className="relative overflow-hidden border-b border-white/[0.08] px-5 py-4">
                  <div
                    className="pointer-events-none absolute inset-0 bg-gradient-to-br from-[#cc0033]/20 via-transparent to-transparent"
                    aria-hidden
                  />
                  <div className="relative flex items-start justify-between gap-3">
                    <div>
                      <p id="live-campus-title" className="text-base font-semibold tracking-tight text-white">
                        Live campus
                      </p>
                      <p className="mt-1 max-w-[240px] text-[12px] leading-relaxed text-zinc-500">
                        Refresh feeds Passio, dining, and SOC into chat context.
                      </p>
                    </div>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 w-9 shrink-0 rounded-xl border-white/10 bg-white/[0.06] text-zinc-400 shadow-none hover:bg-white/10 hover:text-white"
                      onClick={() => setLiveOpen(false)}
                      aria-label="Close"
                    >
                      <PanelRightClose className="h-5 w-5" />
                    </Button>
                  </div>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto rgpt-scroll">
                  <div className="space-y-5 p-5">
                    <RutgersCampusSettings useStore={useRutgersIQStore} />
                    <div className="overflow-hidden rounded-2xl border border-white/[0.08] ring-1 ring-black/40">
                      <RutgersDashboard
                        useStore={useRutgersIQStore}
                        title="Live campus data"
                        transport={transport}
                        onLiveData={onLiveData}
                        dashboardRefreshRef={dashboardRefreshRef}
                      />
                    </div>
                  </div>
                </div>
                <div className="border-t border-white/[0.08] p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
                  <Button
                    type="button"
                    className="h-11 w-full gap-2 rounded-xl bg-gradient-to-r from-[#e0244a] to-[#b10228] text-[15px] font-semibold text-white shadow-lg shadow-[#cc0033]/20 hover:from-[#ff2d55] hover:to-[#cc0033]"
                    onClick={() => dashboardRefreshRef.current?.()}
                  >
                    <PanelRightOpen className="h-4 w-4 opacity-90" />
                    Refresh live data
                  </Button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
