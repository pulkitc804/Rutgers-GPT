import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { loadScarletOracleSystemPrompt } from "@/ai/load-system-prompt";
import { buildExecutionContract } from "@/lib/agent-execution-contract";
import { detectActionIntent } from "@/lib/detect-action-intent";
import { formatDirectScheduleResponse } from "@/lib/format-direct-schedule-response";
import { runRutgersOracleAgentStream } from "@/lib/oracle-agent";
import type { PrefetchedToolResult } from "@/lib/oracle-agent";
import { getOracleLlmMode, useDirectScheduleRender } from "@/lib/oracle-llm-config";
import { resolveTermPlan } from "@/lib/resolve-term-plan";
import { runRutgersAgentTool } from "@/lib/rutgers-tool-runner";
import { wantsCsFirstYearTemplate } from "@rutgers-gpt/shared/ai/course-parser";
import { formatRagHitsForAgent, searchRutgersKnowledge } from "@/lib/rutgers-rag/search";
import { lookupRutgersOfficial } from "@/lib/rutgers-web-lookup";
import { rerankWithOllamaEmbeddings } from "@/lib/rutgers-rag/embed-ollama";
import { formatTruthLayerBlock, type TruthLayerSource } from "@rutgers-gpt/shared/ai/confidence";
import { detectVerifiedTopics, formatVerifiedFactsBlock } from "@rutgers-gpt/shared/ai/verified-sources";
import type { RutgersInsightContext } from "@rutgers-gpt/shared/ai";
import type { RutgersStudentProfile } from "@rutgers-gpt/shared/ai/student-profile";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const MAX_MSG = 24;
const MAX_CHARS = 12_000;

type ChatBody = {
  messages?: { role: "user" | "assistant"; content: string }[];
  context?: RutgersInsightContext;
  truthLayerSources?: TruthLayerSource[];
  studentProfile?: RutgersStudentProfile;
};

function clampMessages(raw: ChatBody["messages"]): MessageParam[] {
  if (!Array.isArray(raw) || !raw.length) return [];
  const slice = raw.slice(-MAX_MSG);
  const out: MessageParam[] = [];
  for (const m of slice) {
    if (m.role !== "user" && m.role !== "assistant") continue;
    const c = typeof m.content === "string" ? m.content.slice(0, MAX_CHARS) : "";
    if (!c.trim()) continue;
    out.push({ role: m.role, content: c });
  }
  return out;
}

function textToStream(text: string): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(text));
      controller.close();
    },
  });
}

function termLabelFromCode(term: number): string {
  if (term === 1) return "Spring";
  if (term === 7) return "Summer";
  return "Fall";
}

export async function POST(req: Request) {
  const mode = getOracleLlmMode();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (mode === "anthropic" && !apiKey) {
    return NextResponse.json(
      {
        error:
          "ORACLE_LLM=anthropic requires ANTHROPIC_API_KEY. Unset ORACLE_LLM to use local Ollama when no key is set, or add ANTHROPIC_API_KEY.",
      },
      { status: 503 },
    );
  }

  try {
    let body: ChatBody;
    try {
      body = (await req.json()) as ChatBody;
    } catch {
      return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
    }

    const messages = clampMessages(body.messages);
    if (!messages.length || messages[messages.length - 1]?.role !== "user") {
      return NextResponse.json({ error: "Send at least one user message as the last turn." }, { status: 400 });
    }

    const systemPrompt = await loadScarletOracleSystemPrompt();
    const sources = Array.isArray(body.truthLayerSources) ? body.truthLayerSources : [];
    const truthBlock = formatTruthLayerBlock(sources);

    const lastMsg = messages[messages.length - 1];
    const lastRaw = typeof lastMsg?.content === "string" ? lastMsg.content : "";
    const intent = detectActionIntent(lastRaw);

    const contextParts: string[] = [];
    const prefetchedTools: PrefetchedToolResult[] = [];
    // True once the server has injected enough grounding (RAG/search/tool results) that the
    // model can answer in ONE call without calling tools itself — lets us drop the tool
    // schemas for that turn (~1k tokens saved, keeps us under the free-tier minute).
    let prefetchSatisfied = false;

    const verifiedTopics = detectVerifiedTopics(lastRaw);
    if (verifiedTopics.length) {
      const verifiedBlock = formatVerifiedFactsBlock(verifiedTopics);
      if (verifiedBlock) contextParts.push(verifiedBlock);
    }

    if (body.context && typeof body.context === "object") {
      contextParts.push(
        "Cached live campus snapshot (may be stale — prefer prefetched tools / fresh tool calls):",
        JSON.stringify(body.context, null, 2),
      );
    }

    // Prefetch RAG for any non-action question (transit/dining/schedule are prefetched
    // separately below). Injecting hits lets the model answer in ONE call instead of
    // calling search_rutgers_knowledge itself — critical under tight free-tier token limits.
    const actionPrefetch = intent.transit || intent.dining || intent.schedule.match;
    const ragKeywordHit =
      /\b(campus|building|hours|library|canvas|policy|atrium|dining|meal|food|livi|livingston|busch|cook|douglass|college ave|degree|major|financial aid|tuition|fee|bill|payment|refund|housing|dorm|parking|netid|advising|tutoring|career|health|caps|registrar|transcript|graduation|deadline|register)\b/i.test(
        lastRaw,
      );
    if (ragKeywordHit || (!actionPrefetch && lastRaw.trim().length > 6)) {
      let hits = await searchRutgersKnowledge({ query: lastRaw, campus: "NB", limit: 5 });
      hits = await rerankWithOllamaEmbeddings(lastRaw, hits);
      const ragStrong = hits.length > 0 && hits[0].score >= 1.5;

      if (ragStrong) {
        contextParts.push(
          "RUTGERS_KNOWLEDGE (RAG — answer from this and cite the Source URL; do NOT call search_rutgers_knowledge again):",
          formatRagHitsForAgent(hits),
        );
      } else if (!actionPrefetch) {
        // RAG had no strong hit → do a LIVE web search here on the server and inject the
        // results, so the model answers in ONE call. (A model-initiated tool call would be
        // a 2nd round, and two calls/turn blow the free-tier token-per-minute limit.)
        let injected = false;
        try {
          const lookup = await lookupRutgersOfficial(lastRaw);
          if (lookup.results.length) {
            const block = lookup.results
              .map((r, i) => `[${i + 1}] ${r.title} (Source: ${r.url})\n${r.excerpt}`)
              .join("\n\n---\n\n")
              .slice(0, 4500);
            contextParts.push(
              "RUTGERS_WEB_SEARCH (live results — write a thorough, specific answer from these and cite the Source url(s); do NOT call search_rutgers_web again. If the exact fact isn't here, say so and link the most relevant page):",
              block,
            );
            injected = true;
          }
        } catch {
          /* search failed — fall through to RAG/abstain */
        }
        if (!injected && hits.length) {
          contextParts.push(
            "RUTGERS_KNOWLEDGE (RAG — partial match; answer what's supported and link the official page):",
            formatRagHitsForAgent(hits),
          );
        }
      } else if (hits.length) {
        contextParts.push(
          "RUTGERS_KNOWLEDGE (RAG — answer from this and cite the Source URL; do NOT call search_rutgers_knowledge again):",
          formatRagHitsForAgent(hits),
        );
      }
    }
    // If we injected any grounding above, the model can answer in one call without tools.
    if (contextParts.some((p) => p.startsWith("RUTGERS_KNOWLEDGE") || p.startsWith("RUTGERS_WEB_SEARCH"))) {
      prefetchSatisfied = true;
    }

    let directScheduleText: string | null = null;
    const planIntent = intent.schedule;
    if (planIntent.match && planIntent.year != null && planIntent.term) {
      const plan = await resolveTermPlan({
        year: planIntent.year,
        term: planIntent.term,
        campus: "NB",
        courses: planIntent.coursesInMessage,
        track: wantsCsFirstYearTemplate(lastRaw) ? "cs-first-year" : undefined,
        profile: body.studentProfile,
        userMessage: lastRaw,
      });

      const brief =
        "studentBrief" in plan && typeof plan.studentBrief === "string"
          ? plan.studentBrief
          : "error" in plan
            ? String(plan.error)
            : JSON.stringify(plan).slice(0, 4000);

      const planCourses =
        "courses" in plan && Array.isArray(plan.courses) ? (plan.courses as { found?: boolean }[]) : [];
      const socFound = planCourses.filter((c) => c.found).length;
      const termCode = "term" in plan && typeof plan.term === "number" ? plan.term : 9;

      if (mode === "ollama" && useDirectScheduleRender()) {
        directScheduleText = formatDirectScheduleResponse({
          brief,
          socFound,
          totalCourses: planCourses.length,
          year: planIntent.year,
          termLabel: termLabelFromCode(termCode),
        });
      } else {
        contextParts.push(
          "PRECOMPUTED_SOC_PLAN (mandatory — include section numbers and weekly grid when present):",
          brief,
        );
        if (socFound > 0) {
          contextParts.push(
            `SOC_PLAN_REPLY_RULES: Live SOC returned sections for ${socFound}/${planCourses.length} courses. Synthesize intelligently for this student — include weekly grid and section examples from the plan. Explain SOC briefly if they seem unsure.`,
          );
        } else {
          contextParts.push(
            "SOC_PLAN_REPLY_RULES: No SOC sections — explain SOC, then honest next steps with per-course SOC links; no invented meeting times.",
          );
        }
      }

      // The readable plan is already injected above as PRECOMPUTED_SOC_PLAN. Don't also dump the
      // raw 12k-char JSON (the model never reads it — it just burns ~3k tokens and throttles the
      // free-tier minute). Just signal the tool already ran so the model doesn't re-call it.
      prefetchedTools.push({
        name: "plan_term_schedule",
        content:
          "Already executed on the server — use PRECOMPUTED_SOC_PLAN above. Do NOT call plan_term_schedule again; synthesize the reply from that plan.",
      });
    }

    const toolCtx = { profile: body.studentProfile, liveSnapshot: body.context };

    if (intent.dining && !intent.schedule.match) {
      const dining = await runRutgersAgentTool(
        "get_dining_menu",
        { locationId: body.studentProfile?.diningLocationId },
        toolCtx,
      );
      prefetchedTools.push({ name: "get_dining_menu", content: dining });
    }

    if (intent.transit) {
      const transit = await runRutgersAgentTool("get_live_transit", {}, toolCtx);
      prefetchedTools.push({ name: "get_live_transit", content: transit });
    }

    const executionContract = buildExecutionContract(intent, {
      hasPrecomputedPlan: intent.schedule.match,
    });

    const lastUserContent = [...contextParts, "", "---", "", lastRaw].join("\n");

    if (directScheduleText) {
      return new Response(textToStream(directScheduleText), {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Rutgers-Gpt-Model": `ollama:direct-soc`,
          "X-Rutgers-Gpt-Agent": "scarlet-oracle-v1",
        },
      });
    }

    const chatTurns = messages.map((m) => ({
      role: m.role as "user" | "assistant",
      content: typeof m.content === "string" ? m.content : "",
    }));

    const { stream, modelHeader } = await runRutgersOracleAgentStream({
      systemPrompt,
      messages: chatTurns,
      profile: body.studentProfile,
      liveSnapshot: body.context,
      truthBlock,
      lastUserContent,
      executionContract,
      prefetchedTools,
      prefetchSatisfied: prefetchSatisfied || prefetchedTools.length > 0,
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Rutgers-Gpt-Model": modelHeader,
        "X-Rutgers-Gpt-Agent": "scarlet-oracle-v1",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chat route failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
