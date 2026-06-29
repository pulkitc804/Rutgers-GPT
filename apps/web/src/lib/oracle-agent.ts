import Anthropic from "@anthropic-ai/sdk";
import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";
import { toAnthropicTools, toGeminiTools, toGroqTools, toOllamaTools } from "@rutgers-gpt/shared/ai/agent-tools";
import { formatStudentProfileBlock, type RutgersStudentProfile } from "@rutgers-gpt/shared/ai/student-profile";
import type { RutgersInsightContext } from "@rutgers-gpt/shared/ai";
import { normalizeAnthropicTurns } from "@/lib/anthropic-messages";
import { createOllamaChatTextStream, ollamaChatRaw } from "@/lib/ollama-oracle";
import { geminiGenerateContent, type GeminiContent, type GeminiPart } from "@/lib/gemini-oracle";
import { groqChatCompletion, type GroqMessage } from "@/lib/groq-oracle";
import { OLLAMA_FINAL_SYNTHESIS_USER } from "@/lib/agent-execution-contract";
import {
  getAnthropicTemperature,
  getGeminiBaseUrl,
  getGeminiModel,
  getGeminiTemperature,
  getGroqBaseUrl,
  getGroqModel,
  getGroqTemperature,
  getOllamaBaseUrl,
  getOllamaGenerationOptions,
  getOllamaModel,
  getOracleLlmMode,
  type OracleLlmMode,
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
  /** Server already injected enough grounding → answer in one call, drop tool schemas. */
  prefetchSatisfied?: boolean;
};

// Kept modest so a turn fits the tight free-tier token-per-minute limit (Groq free = 8k TPM; lifted on the paid Developer tier).
const TOOL_RESULT_MAX_CHARS = 2800;

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
  // Scope/tools/anti-hallucination already live in the base prompt; keep this minimal to save tokens.
  return profileBlock ? `${base}\n\n---\nStudent profile:\n${profileBlock}` : base;
}

/**
 * Deterministic anti-slop pass: strip any model-emitted "Truth confidence:" line
 * (small models keep adding it despite the prompt). Belt-and-suspenders with the
 * system prompt + execution contract. See SECURITY-PLAN P1-6.
 */
function stripModelBoilerplate(text: string): string {
  return text
    .replace(/^\s*[*_-]*\s*Truth confidence:.*$/gim, "")
    // gpt-oss citation artifacts like 【2†excerpt】 / 【3†L1-L4】
    .replace(/【[^】]*】/g, "")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
  const tools = params.prefetchSatisfied ? undefined : toGeminiTools();
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

async function runGroqAgentLoop(params: AgentRunParams, apiKey: string, model: string): Promise<string> {
  const system = buildAgentSystemPrompt(params.systemPrompt, params.profile);
  // When the server already injected grounding, drop tool schemas (~1k tokens) and force a
  // single synthesis call — the model answers from context instead of a 2nd tool round.
  const tools = params.prefetchSatisfied ? undefined : toGroqTools();
  const ctx: ToolRunContext = { profile: params.profile, liveSnapshot: params.liveSnapshot };
  const baseUrl = getGroqBaseUrl();
  const temperature = getGroqTemperature();

  const messages: GroqMessage[] = [
    { role: "system", content: system },
    ...params.messages.slice(0, -1).map((m): GroqMessage => ({ role: m.role, content: m.content })),
    { role: "user", content: buildOllamaUserTurn(params) },
  ];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const res = await groqChatCompletion({ baseUrl, apiKey, model, messages, tools, temperature, maxTokens: 2200 });
    if (!res.ok) return `[Groq: ${res.error}]`;

    const msg = res.message;
    const toolCalls = msg.tool_calls;
    if (!toolCalls?.length) {
      return (msg.content ?? "").trim() || "(No text returned)";
    }

    messages.push({ role: "assistant", content: msg.content ?? "", tool_calls: toolCalls });
    for (const tc of toolCalls) {
      const result = await runRutgersAgentTool(
        tc.function?.name as Parameters<typeof runRutgersAgentTool>[0],
        parseToolArgs(tc.function?.arguments),
        ctx,
      );
      messages.push({ role: "tool", tool_call_id: tc.id, content: truncateToolResult(result) });
    }
  }

  return "I hit the tool step limit — ask again with a narrower question.";
}

/** A failed provider run is marked with a `[Provider: ...]` prefix or empty text. */
function isProviderError(text: string): boolean {
  const t = text.trim();
  if (!t || t === "(No text returned)") return true;
  return /^\[(Groq|Gemini|Anthropic|Ollama|Agent):/i.test(t);
}

/** Shown only when EVERY available free provider is throttled/unavailable. Never a raw error. */
const FRIENDLY_BUSY =
  "I'm getting a burst of questions right now and hit a quick free-tier limit. Give me about 15 seconds and ask again — your answer will come right through.";

type ProviderAttempt = { name: string; run: () => Promise<string> };

/** Build the ordered provider chain: selected mode first, other configured providers as fallback. */
function buildProviderChain(params: AgentRunParams, mode: OracleLlmMode): ProviderAttempt[] {
  const groqKey = process.env.GROQ_API_KEY?.trim();
  const geminiKey = process.env.GEMINI_API_KEY?.trim();
  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim();

  const providers: Record<string, ProviderAttempt | null> = {
    groq: groqKey
      ? { name: `groq:${getGroqModel()}`, run: () => runGroqAgentLoop(params, groqKey, getGroqModel()) }
      : null,
    gemini: geminiKey
      ? { name: `gemini:${getGeminiModel()}`, run: () => runGeminiAgentLoop(params, geminiKey, getGeminiModel()) }
      : null,
    anthropic: anthropicKey
      ? {
          name: process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest",
          run: () => runAnthropicAgentLoop(params, anthropicKey, process.env.ANTHROPIC_MODEL ?? "claude-3-5-sonnet-latest"),
        }
      : null,
  };

  // Primary by mode, then the rest (free providers first) as fallback.
  const order = mode === "gemini" ? ["gemini", "groq", "anthropic"]
    : mode === "anthropic" ? ["anthropic", "groq", "gemini"]
    : ["groq", "gemini", "anthropic"]; // groq default
  return order.map((k) => providers[k]).filter((p): p is ProviderAttempt => p != null);
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

  // Hosted providers (groq / gemini / anthropic) with automatic fallback: try each in
  // order; on a throttle/error, transparently fall to the next. The user never sees a raw
  // provider error — only a real answer, or a friendly "busy" note if all are throttled.
  const chain = buildProviderChain(params, mode);
  if (!chain.length) {
    return {
      stream: textToStream(
        "[Agent: no LLM key configured. Set GROQ_API_KEY (free at https://console.groq.com/keys), GEMINI_API_KEY, or ANTHROPIC_API_KEY in .env.local.]",
      ),
      modelHeader: "no-provider",
    };
  }

  const tried: string[] = [];
  for (const provider of chain) {
    const raw = await provider.run();
    tried.push(provider.name);
    console.warn(`[provider-chain] ${provider.name}: ${isProviderError(raw) ? "FAIL → " + raw.slice(0, 130) : "OK"}`);
    if (!isProviderError(raw)) {
      // Note in the header when a fallback (not the first choice) answered.
      const header = tried.length > 1 ? `${provider.name} (fallback)` : provider.name;
      return { stream: textToStream(stripModelBoilerplate(raw)), modelHeader: header };
    }
  }

  // Every provider was throttled/unavailable — graceful, never the raw error.
  return { stream: textToStream(FRIENDLY_BUSY), modelHeader: `busy:${tried.join("+")}` };
}
