import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { toAnthropicTools, toGeminiTools, toOllamaTools } from "@rutgers-gpt/shared/ai/agent-tools";
import { formatStudentProfileBlock, type RutgersStudentProfile } from "@rutgers-gpt/shared/ai/student-profile";
import type { RutgersInsightContext } from "@rutgers-gpt/shared/ai";
import { normalizeAnthropicTurns } from "@/lib/anthropic-messages";
import { createOllamaChatTextStream, ollamaChatRaw } from "@/lib/ollama-oracle";
import { geminiGenerateContent, type GeminiContent, type GeminiPart } from "@/lib/gemini-oracle";
import { OLLAMA_FINAL_SYNTHESIS_USER } from "@/lib/agent-execution-contract";
import {
  getAnthropicTemperature,
  getGeminiBaseUrl,
  getGeminiModel,
  getGeminiTemperature,
  getOllamaBaseUrl,
  getOllamaGenerationOptions,
  getOllamaModel,
  getOracleLlmMode,
} from "@/lib/oracle-llm-config";
import { runRutgersAgentTool, type ToolRunContext } from "@/lib/rutgers-tool-runner";

const MAX_TOOL_ROUNDS = 6;

type ChatTurn = { role: "user" | "assistant"; content: string };

export type PrefetchedToolResult = { name: string; content: string };

type AgentRunParams = {
  systemPrompt: string;
  messages: ChatTurn[];
  profile?: RutgersStudentProfile;
  liveSnapshot?: RutgersInsightContext;
  truthBlock: string;
  lastUserContent: string;
  executionContract?: string;
  prefetchedTools?: PrefetchedToolResult[];
};

const TOOL_RESULT_MAX_CHARS = 7000;

function truncateToolResult(text: string): string {
  if (text.length <= TOOL_RESULT_MAX_CHARS) return text;
  return `${text.slice(0, TOOL_RESULT_MAX_CHARS)}\n…[truncated — use SOC/tool JSON above]`;
}

function buildOllamaUserTurn(params: AgentRunParams): string {
  const parts: string[] = [];
  if (params.executionContract?.trim()) parts.push(params.executionContract.trim());
  if (params.prefetchedTools?.length) {
    parts.push("PREFETCHED_TOOL_RESULTS (already ran on server — do not re-fetch unless stale):");
    for (const t of params.prefetchedTools) {
      parts.push(`### Tool: ${t.name}\n${truncateToolResult(t.content)}`);
    }
  }
  if (params.truthBlock.trim()) parts.push(params.truthBlock.trim());
  if (params.lastUserContent.trim()) parts.push(params.lastUserContent.trim());
  return parts.join("\n\n");
}

function buildAgentSystemPrompt(base: string, profile?: RutgersStudentProfile): string {
  const profileBlock = formatStudentProfileBlock(profile);
  const agentDirective = [
    "",
    "---",
    "Agent mode (active):",
    "You are a dedicated Rutgers student agent with tools + RAG knowledge + persistent student memory.",
    "Scope: Rutgers–New Brunswick only (College Ave, Busch, Livingston, Cook/Douglass). Do not advise on Newark or Camden. Use search_rutgers_knowledge for policies, campuses, buildings, Canvas help.",
    "For dining halls or which campus a building is on: call get_dining_menu or search_rutgers_knowledge — never guess (Atrium = College Avenue / College Ave Student Center per food.rutgers.edu).",
    "Use plan_term_schedule for ANY major/year — student course list from profile (double/triple major = one combined list) — never generic link dumps.",
    "Use get_canvas_guidance, get_campus_events, get_campus_info, get_live_transit (all saved stops) as needed.",
    "Repeat only facts present in tool JSON (verified, primarySource, fetchedAt). Cite official URLs when stating locations or menus.",
    "Respect persistent memory facts and enrolled courses from the profile block.",
    profileBlock ? `\n${profileBlock}` : "",
  ].join("\n");
  return base + agentDirective;
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

function parseToolArgs(raw: unknown): Record<string, unknown> {
  if (raw == null) return {};
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return {};
}

type OllamaMsg = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
};

async function runOllamaAgentToMessages(params: AgentRunParams): Promise<
  { ok: true; messages: OllamaMsg[] } | { ok: false; error: string }
> {
  const base = getOllamaBaseUrl();
  const model = getOllamaModel();
  const gen = getOllamaGenerationOptions();
  const tools = toOllamaTools();
  const system = buildAgentSystemPrompt(params.systemPrompt, params.profile);

  const ollamaMessages: OllamaMsg[] = [
    { role: "system", content: system },
    ...params.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content })),
    { role: "user", content: buildOllamaUserTurn(params) },
  ];

  const ctx: ToolRunContext = { profile: params.profile, liveSnapshot: params.liveSnapshot };
  let ranToolsThisTurn = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await ollamaChatRaw(base, model, ollamaMessages, { generation: gen, tools });
    if (!res.ok) return { ok: false, error: res.error };

    const msg = res.data.message;
    if (!msg) return { ok: false, error: "No message from Ollama" };

    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      if (ranToolsThisTurn) break;
      const draft = (msg.content ?? "").trim();
      return { ok: true, messages: [...ollamaMessages, { role: "assistant", content: draft }] };
    }

    ranToolsThisTurn = true;
    ollamaMessages.push({
      role: "assistant",
      content: msg.content ?? "",
      tool_calls: toolCalls,
    });

    for (const tc of toolCalls) {
      const name = tc.function?.name as Parameters<typeof runRutgersAgentTool>[0];
      const args = parseToolArgs(tc.function?.arguments);
      const result = await runRutgersAgentTool(name, args, ctx);
      ollamaMessages.push({ role: "tool", content: truncateToolResult(result) });
    }
  }

  if (ranToolsThisTurn) {
    ollamaMessages.push({ role: "user", content: OLLAMA_FINAL_SYNTHESIS_USER });
    return { ok: true, messages: ollamaMessages };
  }

  return {
    ok: false,
    error: "Tool step limit — ask again with a narrower question (e.g. one bus stop or one course).",
  };
}

function ranToolsCheck(msgs: OllamaMsg[]): boolean {
  return msgs.some((m) => m.role === "tool");
}

async function runAnthropicAgentLoop(params: AgentRunParams, apiKey: string, model: string): Promise<string> {
  const system = buildAgentSystemPrompt(params.systemPrompt, params.profile);
  const tools = toAnthropicTools();
  const ctx: ToolRunContext = { profile: params.profile, liveSnapshot: params.liveSnapshot };

  const lastUser: MessageParam = {
    role: "user",
    content: buildOllamaUserTurn(params),
  };
  let messages = normalizeAnthropicTurns([
    ...params.messages.slice(0, -1).map((m) => ({ role: m.role, content: m.content }) as MessageParam),
    lastUser,
  ]);

  const client = new Anthropic({ apiKey });

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      temperature: getAnthropicTemperature(),
      system,
      tools,
      messages,
    });

    const toolBlocks = response.content.filter((b) => b.type === "tool_use");
    const textBlocks = response.content.filter((b) => b.type === "text");
    const text = textBlocks.map((b) => (b.type === "text" ? b.text : "")).join("\n").trim();

    if (response.stop_reason !== "tool_use" || !toolBlocks.length) {
      return text || "(No text returned)";
    }

    messages = [
      ...messages,
      { role: "assistant", content: response.content },
    ];

    const toolResultBlocks: { type: "tool_result"; tool_use_id: string; content: string }[] = [];
    for (const block of toolBlocks) {
      if (block.type !== "tool_use") continue;
      const result = await runRutgersAgentTool(
        block.name as Parameters<typeof runRutgersAgentTool>[0],
        block.input as Record<string, unknown>,
        ctx,
      );
      toolResultBlocks.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: result,
      });
    }
    messages = [...messages, { role: "user", content: toolResultBlocks }];
  }

  return "I hit the tool step limit — ask again with a narrower question.";
}

async function runGeminiAgentLoop(params: AgentRunParams, apiKey: string, model: string): Promise<string> {
  const system = buildAgentSystemPrompt(params.systemPrompt, params.profile);
  const tools = toGeminiTools();
  const ctx: ToolRunContext = { profile: params.profile, liveSnapshot: params.liveSnapshot };
  const baseUrl = getGeminiBaseUrl();
  const temperature = getGeminiTemperature();

  const contents: GeminiContent[] = [
    ...params.messages.slice(0, -1).map(
      (m): GeminiContent => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }),
    ),
    { role: "user", parts: [{ text: buildOllamaUserTurn(params) }] },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await geminiGenerateContent({
      baseUrl,
      apiKey,
      model,
      systemInstruction: system,
      contents,
      tools,
      temperature,
    });
    if (!res.ok) return `[Gemini: ${res.error}]`;

    if (!res.functionCalls.length) {
      return res.text || "(No text returned)";
    }

    // Echo the model's function-call turn back, then answer each call.
    if (res.content) contents.push(res.content);
    const responseParts: GeminiPart[] = [];
    for (const fc of res.functionCalls) {
      const result = await runRutgersAgentTool(
        fc.name as Parameters<typeof runRutgersAgentTool>[0],
        (fc.args ?? {}) as Record<string, unknown>,
        ctx,
      );
      responseParts.push({
        functionResponse: { name: fc.name, response: { result: truncateToolResult(result) } },
      });
    }
    contents.push({ role: "user", parts: responseParts });
  }

  return "I hit the tool step limit — ask again with a narrower question.";
}

/** Runs the Rutgers agent (tool loop) and returns a plain-text stream for the chat UI. */
export async function runRutgersOracleAgentStream(params: AgentRunParams): Promise<{
  stream: ReadableStream<Uint8Array>;
  modelHeader: string;
}> {
  const mode = getOracleLlmMode();

  if (mode === "ollama") {
    const base = getOllamaBaseUrl();
    const model = getOllamaModel();
    const gen = getOllamaGenerationOptions();
    const built = await runOllamaAgentToMessages(params);
    if (!built.ok) {
      return {
        stream: textToStream(`\n\n[Ollama: ${built.error}]`),
        modelHeader: `ollama:${model}`,
      };
    }
    const last = built.messages[built.messages.length - 1];
    if (last?.role === "assistant" && last.content.trim() && !ranToolsCheck(built.messages)) {
      return { stream: textToStream(last.content.trim()), modelHeader: `ollama:${model}` };
    }
    return {
      stream: createOllamaChatTextStream(base, model, built.messages, { generation: gen }),
      modelHeader: `ollama:${model}`,
    };
  }

  if (mode === "gemini") {
    const apiKey = process.env.GEMINI_API_KEY;
    const model = getGeminiModel();
    if (!apiKey) {
      return {
        stream: textToStream(
          "[Agent: GEMINI_API_KEY required for Gemini mode. Get a free key at https://aistudio.google.com/apikey]",
        ),
        modelHeader: "gemini:missing-key",
      };
    }
    const text = await runGeminiAgentLoop(params, apiKey, model);
    return { stream: textToStream(text), modelHeader: `gemini:${model}` };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      stream: textToStream("[Agent: ANTHROPIC_API_KEY required for cloud mode.]"),
      modelHeader: "anthropic:missing-key",
    };
  }

  const model = process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest";
  const text = await runAnthropicAgentLoop(params, apiKey, model);
  return { stream: textToStream(text), modelHeader: model };
}
