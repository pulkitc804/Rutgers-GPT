import { loadScarletOracleSystemPrompt } from "@/ai/load-system-prompt";
import { ollamaChatOnce } from "@/lib/ollama-oracle";
import { geminiGenerateContent } from "@/lib/gemini-oracle";
import { groqChatCompletion } from "@/lib/groq-oracle";
import {
  getOracleLlmMode,
  getOllamaBaseUrl,
  getOllamaGenerationOptions,
  getOllamaModel,
  getGeminiBaseUrl,
  getGeminiModel,
  getGeminiTemperature,
  getGroqBaseUrl,
  getGroqModel,
  getGroqTemperature,
  getCerebrasBaseUrl,
  getCerebrasModel,
  getCerebrasTemperature,
} from "@/lib/oracle-llm-config";
import {
  aggregateTruthConfidence,
  describeTruthLayerRow,
  formatTruthLayerBlock,
} from "@rutgers-gpt/shared/ai/confidence";
import {
  createAIProvider,
  type OracleInsightResult,
  type RutgersInsightContext,
  type TruthLayerSource,
} from "@rutgers-gpt/shared/ai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  context?: RutgersInsightContext;
  truthLayerSources?: TruthLayerSource[];
};

export async function POST(req: Request) {
  if (Number(req.headers.get("content-length") ?? 0) > 32_000) {
    return NextResponse.json({ error: "Request too large" }, { status: 413 });
  }
  const mode = getOracleLlmMode();
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (mode === "anthropic" && !apiKey) {
    return NextResponse.json(
      {
        error:
          "ORACLE_LLM=anthropic requires ANTHROPIC_API_KEY. Unset ORACLE_LLM to use local Ollama when no key is set.",
      },
      { status: 503 },
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.context || typeof body.context !== "object") {
    return NextResponse.json({ error: "Missing `context` object" }, { status: 400 });
  }

  try {
    const systemPrompt = await loadScarletOracleSystemPrompt();
    const sources = Array.isArray(body.truthLayerSources) ? body.truthLayerSources : [];
    const now = new Date();

    if (mode === "ollama") {
      const truthBlock = formatTruthLayerBlock(sources, now);
      const truthLayerRows = sources.map((s) => describeTruthLayerRow(s, now));
      const aggregateConfidence = sources.length
        ? aggregateTruthConfidence(truthLayerRows.map((r) => r.level))
        : ("medium" as OracleInsightResult["aggregateConfidence"]);

      const userPayload = [
        truthBlock,
        "",
        "Context JSON:",
        JSON.stringify(body.context, null, 2),
        "",
        "Provide actionable insights for a Rutgers student dashboard.",
      ].join("\n");

      const ollama = await ollamaChatOnce(
        getOllamaBaseUrl(),
        getOllamaModel(),
        [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        { generation: getOllamaGenerationOptions() },
      );
      if (!ollama.ok) {
        return NextResponse.json({ error: ollama.error }, { status: ollama.status });
      }
      const result: OracleInsightResult = {
        text: ollama.text,
        truthLayerRows,
        aggregateConfidence,
      };
      return NextResponse.json(result);
    }

    if (mode === "cerebras" || mode === "groq") {
      const isCerebras = mode === "cerebras";
      const apiKey = isCerebras ? process.env.CEREBRAS_API_KEY : process.env.GROQ_API_KEY;
      if (!apiKey) {
        return NextResponse.json(
          {
            error: isCerebras
              ? "ORACLE_LLM=cerebras requires CEREBRAS_API_KEY (free at https://cloud.cerebras.ai)."
              : "ORACLE_LLM=groq requires GROQ_API_KEY (free at https://console.groq.com/keys).",
          },
          { status: 503 },
        );
      }
      const truthBlock = formatTruthLayerBlock(sources, now);
      const truthLayerRows = sources.map((s) => describeTruthLayerRow(s, now));
      const aggregateConfidence = sources.length
        ? aggregateTruthConfidence(truthLayerRows.map((r) => r.level))
        : ("medium" as OracleInsightResult["aggregateConfidence"]);

      const userPayload = [
        truthBlock,
        "",
        "Context JSON:",
        JSON.stringify(body.context, null, 2),
        "",
        "Provide actionable insights for a Rutgers student dashboard.",
      ].join("\n");

      const groq = await groqChatCompletion({
        baseUrl: isCerebras ? getCerebrasBaseUrl() : getGroqBaseUrl(),
        apiKey,
        model: isCerebras ? getCerebrasModel() : getGroqModel(),
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPayload },
        ],
        temperature: isCerebras ? getCerebrasTemperature() : getGroqTemperature(),
      });
      if (!groq.ok) {
        return NextResponse.json({ error: groq.error }, { status: 502 });
      }
      const result: OracleInsightResult = {
        text: groq.message.content ?? "",
        truthLayerRows,
        aggregateConfidence,
      };
      return NextResponse.json(result);
    }

    if (mode === "gemini") {
      const geminiKey = process.env.GEMINI_API_KEY;
      if (!geminiKey) {
        return NextResponse.json(
          { error: "ORACLE_LLM=gemini requires GEMINI_API_KEY (free at https://aistudio.google.com/apikey)." },
          { status: 503 },
        );
      }
      const truthBlock = formatTruthLayerBlock(sources, now);
      const truthLayerRows = sources.map((s) => describeTruthLayerRow(s, now));
      const aggregateConfidence = sources.length
        ? aggregateTruthConfidence(truthLayerRows.map((r) => r.level))
        : ("medium" as OracleInsightResult["aggregateConfidence"]);

      const userPayload = [
        truthBlock,
        "",
        "Context JSON:",
        JSON.stringify(body.context, null, 2),
        "",
        "Provide actionable insights for a Rutgers student dashboard.",
      ].join("\n");

      const gemini = await geminiGenerateContent({
        baseUrl: getGeminiBaseUrl(),
        apiKey: geminiKey,
        model: getGeminiModel(),
        systemInstruction: systemPrompt,
        contents: [{ role: "user", parts: [{ text: userPayload }] }],
        temperature: getGeminiTemperature(),
      });
      if (!gemini.ok) {
        return NextResponse.json({ error: gemini.error }, { status: 502 });
      }
      const result: OracleInsightResult = {
        text: gemini.text,
        truthLayerRows,
        aggregateConfidence,
      };
      return NextResponse.json(result);
    }

    const provider = createAIProvider(apiKey!);
    const result = await provider.getInsights(body.context, {
      systemPrompt,
      truthLayerSources: sources.length ? sources : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Oracle request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
