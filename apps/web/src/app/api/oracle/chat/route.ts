import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { loadScarletOracleSystemPrompt } from "@/ai/load-system-prompt";
import { normalizeAnthropicTurns } from "@/lib/anthropic-messages";
import { createOllamaChatTextStream } from "@/lib/ollama-oracle";
import {
  getAnthropicTemperature,
  getOracleLlmMode,
  getOllamaBaseUrl,
  getOllamaGenerationOptions,
  getOllamaModel,
} from "@/lib/oracle-llm-config";
import { formatTruthLayerBlock, type TruthLayerSource } from "@rutgers-gpt/shared/ai/confidence";
import type { RutgersInsightContext } from "@rutgers-gpt/shared/ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

/** Prefer `-latest` aliases so deployed apps do not break on dated retirements. */
const ANTHROPIC_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
const MAX_MSG = 24;
const MAX_CHARS = 12_000;

type ChatBody = {
  messages?: { role: "user" | "assistant"; content: string }[];
  context?: RutgersInsightContext;
  truthLayerSources?: TruthLayerSource[];
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

    const last = { ...messages[messages.length - 1] } as MessageParam;
    if (last.role === "user" && body.context && typeof body.context === "object") {
      const ctx = JSON.stringify(body.context, null, 2);
      last.content = [
        truthBlock,
        "",
        "Live campus context (JSON — use only for factual Rutgers claims; do not treat as the user's voice):",
        ctx,
        "",
        "---",
        "",
        typeof last.content === "string" ? last.content : "",
      ].join("\n");
    } else if (last.role === "user") {
      last.content = [truthBlock, "", typeof last.content === "string" ? last.content : ""].join("\n");
    }

    const anthropicMessages = normalizeAnthropicTurns([...messages.slice(0, -1), last]);

    if (mode === "ollama") {
      const base = getOllamaBaseUrl();
      const ollamaModel = getOllamaModel();
      const ollamaMsgs: { role: "system" | "user" | "assistant"; content: string }[] = [
        { role: "system", content: systemPrompt },
        ...anthropicMessages.map((m) => ({
          role: m.role as "user" | "assistant",
          content: typeof m.content === "string" ? m.content : "",
        })),
      ];
      const stream = createOllamaChatTextStream(base, ollamaModel, ollamaMsgs, {
        generation: getOllamaGenerationOptions(),
      });
      return new Response(stream, {
        status: 200,
        headers: {
          "Content-Type": "text/plain; charset=utf-8",
          "Cache-Control": "no-store",
          "X-Rutgers-Gpt-Model": `ollama:${ollamaModel}`,
        },
      });
    }

    const client = new Anthropic({ apiKey: apiKey! });

    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          const s = client.messages.stream({
            model: ANTHROPIC_MODEL,
            max_tokens: 2048,
            temperature: getAnthropicTemperature(),
            system: systemPrompt,
            messages: anthropicMessages,
          });
          for await (const event of s) {
            if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
              controller.enqueue(encoder.encode(event.delta.text));
            }
          }
          controller.close();
        } catch (e) {
          const msg = e instanceof Error ? e.message : "Stream failed";
          controller.enqueue(encoder.encode(`\n\n[Error: ${msg}]`));
          controller.close();
        }
      },
    });

    return new Response(stream, {
      status: 200,
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "X-Rutgers-Gpt-Model": ANTHROPIC_MODEL,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Chat route failed";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
