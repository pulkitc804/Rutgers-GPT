import Anthropic from "@anthropic-ai/sdk";
import {
  aggregateTruthConfidence,
  describeTruthLayerRow,
  formatTruthLayerBlock,
  type ConfidenceLevel,
  type TruthLayerRow,
  type TruthLayerSource,
} from "./confidence";

export type {
  ConfidenceLevel,
  TruthLayerDomain,
  TruthLayerKind,
  TruthLayerRow,
  TruthLayerSource,
} from "./confidence";

export type RutgersInsightContext = {
  /** Freeform text from scrapers, DOM snippets, SOC summaries, etc. */
  bus?: string;
  dining?: string;
  academic?: string;
  /** Wellness / student life pointers (official links, not medical advice) */
  wellness?: string;
  /** Extension-only: page URL or tab metadata */
  page?: string;
};

export type OracleInsightResult = {
  text: string;
  truthLayerRows: TruthLayerRow[];
  /** Weakest relevant tier when multiple sources are attached */
  aggregateConfidence: ConfidenceLevel;
};

const DEFAULT_SYSTEM = `You are Rutgers GPT (Scarlet Oracle), a concise campus assistant for Rutgers University students.
Use only the provided context. If data is missing, say what is missing.
Respond in short paragraphs with bullet points when listing options.
End with: Truth confidence: <High|Medium|Low> — <one short sentence>.`;

export class AIProvider {
  private client: Anthropic;

  constructor(apiKey: string, options?: { baseURL?: string }) {
    this.client = new Anthropic({ apiKey, baseURL: options?.baseURL });
  }

  async getInsights(
    context: RutgersInsightContext,
    options?: {
      systemPrompt?: string;
      model?: string;
      maxTokens?: number;
      /** When set, injected into the user message for calibrated answers */
      truthLayerSources?: TruthLayerSource[];
    },
  ): Promise<OracleInsightResult> {
    const system = options?.systemPrompt ?? DEFAULT_SYSTEM;
    const sources = options?.truthLayerSources ?? [];
    const now = new Date();
    const truthBlock = formatTruthLayerBlock(sources, now);
    const truthLayerRows = sources.map((s) => describeTruthLayerRow(s, now));
    const aggregateConfidence = sources.length
      ? aggregateTruthConfidence(truthLayerRows.map((r) => r.level))
      : ("medium" as ConfidenceLevel);

    const userPayload = [
      truthBlock,
      "",
      "Context JSON:",
      JSON.stringify(context, null, 2),
      "",
      "Provide actionable insights for a Rutgers student dashboard.",
    ].join("\n");

    const msg = await this.client.messages.create({
      model: options?.model ?? "claude-3-5-sonnet-latest",
      max_tokens: options?.maxTokens ?? 1024,
      system,
      messages: [{ role: "user", content: userPayload }],
    });

    const parts: string[] = [];
    for (const b of msg.content) {
      if (b.type === "text") parts.push(b.text);
    }
    const text = parts.join("\n").trim();

    return {
      text: text || "(No text returned)",
      truthLayerRows,
      aggregateConfidence,
    };
  }
}

export function createAIProvider(apiKey: string, options?: { baseURL?: string }): AIProvider {
  return new AIProvider(apiKey, options);
}
