"use client";

import { buildOracleWelcomeMessage } from "@/ai/welcome-message";
import { OracleMarkdown } from "@/components/oracle-markdown";
import { Button } from "@/components/ui/button";
import type { RutgersIQStoreHook, RutgersLiveDataPayload } from "@rutgers-gpt/shared";
import type { RutgersInsightContext } from "@rutgers-gpt/shared/ai";
import type { TruthLayerSource } from "@rutgers-gpt/shared/ai/confidence";
import { AnimatePresence, motion } from "framer-motion";
import { Bus, GraduationCap, HeartPulse, Loader2, SendHorizontal, Sparkles, Utensils } from "lucide-react";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

export type ChatMessage = { id: string; role: "user" | "assistant"; content: string };

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

function buildContextFromLive(live: RutgersLiveDataPayload | null): RutgersInsightContext {
  if (!live) {
    return {
      bus: "No live campus refresh yet — user should open Live campus and tap Refresh all.",
      dining: "No dining HTML snapshot yet.",
      academic: "No SOC course snapshot yet.",
      wellness: "Official: CAPS https://health.rutgers.edu/counseling · Student Health https://health.rutgers.edu · TimelyCare https://www.timelycare.com/rutgers",
    };
  }
  return {
    bus: live.busText,
    dining: live.diningText,
    academic: live.academicText,
    wellness: live.wellnessText,
  };
}

function truthSourcesFromLive(live: RutgersLiveDataPayload | null): TruthLayerSource[] {
  if (!live) return [];
  const t = live.refreshedAt;
  return [
    { id: "passio", domain: "transit", kind: "live_api", fetchedAt: t },
    { id: "dining", domain: "dining", kind: "live_api", fetchedAt: t },
    { id: "soc", domain: "academics", kind: "live_api", fetchedAt: t },
    { id: "wellness-links", domain: "advice", kind: "static_corpus" },
  ];
}

const QUICK_ACTIONS: { id: string; label: string; icon: typeof Bus; prompt: string }[] = [
  {
    id: "bus",
    label: "Next bus",
    icon: Bus,
    prompt:
      "Using only the live bus text in context, summarize my next arrival and backup options. If the snapshot is empty or errored, say exactly that and tell me to refresh Live campus.",
  },
  {
    id: "dine",
    label: "Dining",
    icon: Utensils,
    prompt:
      "From the dining snapshot only: what meal period and stations look relevant today? If there is no menu data, say so and suggest opening the official dining portal.",
  },
  {
    id: "class",
    label: "Next class",
    icon: GraduationCap,
    prompt:
      "From the academic snapshot only: when and where is my next meeting for the configured course? If SOC returned nothing, explain what to fix (subject/number/term).",
  },
  {
    id: "wellness",
    label: "Wellness",
    icon: HeartPulse,
    prompt:
      "Give a short, factual orientation to CAPS, Student Health, and TimelyCare using only the wellness links in context — no rumors, no wait-time guesses.",
  },
];

function TypingRow() {
  return (
    <span className="inline-flex items-center gap-1.5 py-0.5" aria-hidden>
      <span className="rgpt-typing-dot inline-block h-2 w-2 rounded-full bg-zinc-500" />
      <span className="rgpt-typing-dot inline-block h-2 w-2 rounded-full bg-zinc-500" />
      <span className="rgpt-typing-dot inline-block h-2 w-2 rounded-full bg-zinc-500" />
    </span>
  );
}

type Props = {
  useStore: RutgersIQStoreHook;
  live: RutgersLiveDataPayload | null;
  liveConnected: boolean;
};

export function RutgersGptChat({ useStore, live, liveConnected }: Props) {
  const displayName = useStore((s) => s.displayName);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const messagesRef = useRef<ChatMessage[]>([]);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  messagesRef.current = messages;

  const welcome = useMemo(() => {
    return buildOracleWelcomeMessage(
      {
        displayName: displayName || undefined,
        transitLine: live?.busText?.slice(0, 160),
        diningLine: live?.diningText?.includes("Highlights") ? live.diningText.split("Highlights:")[1]?.slice(0, 120) : undefined,
      },
      new Date(),
    );
  }, [displayName, live]);

  useEffect(() => {
    setMessages((prev) => {
      if (prev.length === 0) {
        return [{ id: "welcome", role: "assistant", content: welcome }];
      }
      if (prev[0]?.id === "welcome") {
        return [{ ...prev[0], content: welcome }, ...prev.slice(1)];
      }
      return prev;
    });
  }, [welcome]);

  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "0px";
    const next = Math.min(Math.max(el.scrollHeight, 44), 200);
    el.style.height = `${next}px`;
  }, [input]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, sending]);

  const sendWithText = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      const userMsg: ChatMessage = { id: uid(), role: "user", content: trimmed };
      const assistantId = uid();
      const prior = messagesRef.current.filter((m) => m.id !== "welcome");
      const historyForApi = [...prior, userMsg].map((x) => ({ role: x.role, content: x.content }));

      setSending(true);
      setMessages((m) => [...m, userMsg, { id: assistantId, role: "assistant", content: "" }]);
      setInput("");

      try {
        const res = await fetch("/api/oracle/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: historyForApi,
            context: buildContextFromLive(live),
            truthLayerSources: truthSourcesFromLive(live),
          }),
        });

        if (!res.ok) {
          let errText = `Chat failed (${res.status})`;
          const ct = res.headers.get("content-type") ?? "";
          try {
            if (ct.includes("application/json")) {
              const j = (await res.json()) as { error?: string };
              if (j?.error) errText = j.error;
            } else {
              const t = await res.text();
              if (t.trim()) errText = t.trim().slice(0, 400);
            }
          } catch {
            /* keep errText */
          }
          setMessages((m) => m.map((row) => (row.id === assistantId ? { ...row, content: errText } : row)));
          return;
        }

        const reader = res.body?.getReader();
        if (!reader) {
          setMessages((m) =>
            m.map((row) => (row.id === assistantId ? { ...row, content: "No response stream." } : row)),
          );
          return;
        }

        const dec = new TextDecoder();
        let acc = "";
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          acc += dec.decode(value, { stream: true });
          setMessages((m) => m.map((row) => (row.id === assistantId ? { ...row, content: acc } : row)));
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Network error";
        setMessages((m) => m.map((row) => (row.id === assistantId ? { ...row, content: msg } : row)));
      } finally {
        setSending(false);
      }
    },
    [live, sending],
  );

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void sendWithText(input);
  };

  const isErr = (t: string) => /^(Chat failed|\[Error:|HTTP\s*\d)/i.test(t.trim());

  return (
    <div className="mx-auto flex h-full min-h-0 w-full max-w-[42rem] flex-1 flex-col lg:max-w-[48rem]">
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-[1.35rem] border border-white/[0.09] bg-zinc-950/50 shadow-[0_24px_80px_-24px_rgba(0,0,0,0.65)] ring-1 ring-white/[0.04] backdrop-blur-2xl">
        <div className="border-b border-white/[0.07] px-4 py-3.5 md:px-5">
          <p className="mb-2.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-zinc-600">Try</p>
          <div className="flex flex-wrap gap-2">
            {QUICK_ACTIONS.map((a) => (
              <Button
                key={a.id}
                type="button"
                variant="outline"
                size="sm"
                disabled={sending}
                className="h-9 gap-2 rounded-full border-white/10 bg-white/[0.05] px-3.5 text-[13px] font-medium text-zinc-200 shadow-sm transition hover:border-[#cc0033]/35 hover:bg-[#cc0033]/12 hover:text-white active:scale-[0.98]"
                onClick={() => void sendWithText(a.prompt)}
              >
                <a.icon className="h-3.5 w-3.5 text-[#ff9eb0] opacity-90" aria-hidden />
                {a.label}
              </Button>
            ))}
            <span
              className={`ml-auto inline-flex items-center gap-2 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide ${
                liveConnected
                  ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-200"
                  : "border-amber-500/25 bg-amber-500/10 text-amber-100"
              }`}
            >
              <span
                className={`h-1.5 w-1.5 rounded-full ${liveConnected ? "animate-pulse bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.35)]" : "bg-amber-400"}`}
              />
              {liveConnected ? "Live snapshot" : "Needs refresh"}
            </span>
          </div>
        </div>

        <div className="rgpt-scroll min-h-0 flex-1 space-y-5 overflow-y-auto scroll-py-6 px-4 py-5 md:px-6">
          <AnimatePresence initial={false}>
            {messages.map((m) => (
              <motion.div
                key={m.id}
                layout
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
              >
                <article
                  className={`max-w-[min(100%,36rem)] ${
                    m.role === "user"
                      ? "rounded-3xl rounded-br-md bg-gradient-to-br from-[#e0244a] to-[#9a0022] px-4 py-3.5 text-[15px] leading-relaxed text-white shadow-lg shadow-[#cc0033]/15 ring-1 ring-white/10"
                      : `rounded-3xl rounded-bl-md border px-4 py-3.5 text-[15px] leading-[1.65] shadow-inner ${
                          isErr(m.content)
                            ? "border-amber-500/30 bg-amber-950/25 text-amber-50"
                            : "border-white/[0.08] bg-zinc-900/75 text-zinc-100 ring-1 ring-black/30"
                        }`
                  }`}
                >
                  {m.role === "assistant" && m.content === "" && sending ? (
                    <span className="inline-flex items-center gap-3 text-zinc-500">
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#ff9eb0]" aria-hidden />
                      <span className="text-sm">Thinking</span>
                      <TypingRow />
                    </span>
                  ) : m.role === "assistant" && !isErr(m.content) ? (
                    <OracleMarkdown content={m.content} />
                  ) : (
                    <p className="whitespace-pre-wrap break-words">{m.content}</p>
                  )}
                </article>
              </motion.div>
            ))}
          </AnimatePresence>
          <div ref={bottomRef} className="h-px shrink-0" />
        </div>

        <form onSubmit={onSubmit} className="border-t border-white/[0.07] p-3 md:p-4">
          <div className="rgpt-composer-focus rgpt-input-shimmer relative flex items-end gap-2 rounded-[1.15rem] border border-white/[0.1] p-1.5 transition-shadow duration-300">
            <div className="pointer-events-none absolute inset-0 rounded-[1.15rem] bg-gradient-to-r from-transparent via-white/[0.03] to-transparent" aria-hidden />
            <Sparkles className="mb-3 ml-2.5 h-5 w-5 shrink-0 text-[#ffb3c7]" aria-hidden />
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask about buses, dining, classes, wellness, planning…"
              rows={1}
              className="max-h-[200px] min-h-[44px] flex-1 resize-none bg-transparent px-1 py-3 text-[15px] leading-relaxed text-zinc-50 placeholder:text-zinc-600 focus:outline-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void sendWithText(input);
                }
              }}
              disabled={sending}
              aria-label="Message"
            />
            <Button
              type="submit"
              size="sm"
              disabled={sending || !input.trim()}
              className="mb-1 mr-1 h-11 w-11 shrink-0 rounded-xl bg-gradient-to-br from-[#e0244a] to-[#9a0022] p-0 text-white shadow-md ring-1 ring-white/15 hover:from-[#ff2d55] hover:to-[#b10228] disabled:opacity-40"
              aria-label="Send"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
            </Button>
          </div>
          <p className="mt-2.5 text-center text-[11px] leading-relaxed text-zinc-600">
            Shift+Enter for a new line. Rutgers GPT refuses graded work and won’t invent live times without a refreshed campus snapshot.
          </p>
        </form>
      </div>
    </div>
  );
}
