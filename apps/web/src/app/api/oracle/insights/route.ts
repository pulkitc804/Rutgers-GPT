import { createAIProvider, type RutgersInsightContext, type TruthLayerSource } from "@rutgers-gpt/shared/ai";
import { loadScarletOracleSystemPrompt } from "@/ai/load-system-prompt";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  context?: RutgersInsightContext;
  truthLayerSources?: TruthLayerSource[];
};

export async function POST(req: Request) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "ANTHROPIC_API_KEY is not set. Add it to apps/web env for Oracle insights." },
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
    const provider = createAIProvider(apiKey);
    const result = await provider.getInsights(body.context, {
      systemPrompt,
      truthLayerSources: Array.isArray(body.truthLayerSources) ? body.truthLayerSources : undefined,
    });
    return NextResponse.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : "Oracle request failed";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
