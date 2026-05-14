/**
 * Truth-Layer: map data provenance + freshness to confidence tiers for the Oracle.
 * HIGH = live Rutgers-aligned API data fetched within 60s (when timestamp provided).
 */

export type ConfidenceLevel = "high" | "medium" | "low";

export type TruthLayerDomain = "transit" | "dining" | "academics" | "advice";

/** How the information was obtained. */
export type TruthLayerKind = "live_api" | "static_corpus" | "heuristic";

export type TruthLayerSource = {
  id: string;
  domain: TruthLayerDomain;
  kind: TruthLayerKind;
  /** ISO 8601; required for live_api to reach HIGH within the freshness window */
  fetchedAt?: string;
};

const FRESH_WINDOW_MS = 60_000;

export function resolveConfidence(source: TruthLayerSource, now = new Date()): ConfidenceLevel {
  if (source.kind === "heuristic") return "low";
  if (source.kind === "static_corpus") return "medium";
  if (source.kind === "live_api") {
    if (!source.fetchedAt) return "medium";
    const t = new Date(source.fetchedAt).getTime();
    if (Number.isNaN(t)) return "medium";
    const age = now.getTime() - t;
    if (age < 0) return "medium";
    return age <= FRESH_WINDOW_MS ? "high" : "medium";
  }
  return "medium";
}

/** Weakest link: if any source is LOW, overall factual tier should not claim HIGH. */
export function aggregateTruthConfidence(levels: ConfidenceLevel[]): ConfidenceLevel {
  if (!levels.length) return "medium";
  if (levels.includes("low")) return "low";
  if (levels.includes("medium")) return "medium";
  return "high";
}

export type TruthLayerRow = {
  id: string;
  domain: TruthLayerDomain;
  level: ConfidenceLevel;
  caption: string;
};

export function describeTruthLayerRow(source: TruthLayerSource, now = new Date()): TruthLayerRow {
  const level = resolveConfidence(source, now);
  const label =
    source.domain === "transit"
      ? "Transit (PassioGo / live proxy)"
      : source.domain === "dining"
        ? "Dining (official menu HTML)"
        : source.domain === "academics"
          ? "Academics (SOC / catalog)"
          : "Guidance (non-verified)";

  let caption: string;
  if (level === "high" && source.kind === "live_api" && source.fetchedAt) {
    const sec = Math.max(0, Math.round((now.getTime() - new Date(source.fetchedAt).getTime()) / 1000));
    caption = `${label}: HIGH — live pull ${sec}s ago (within 60s).`;
  } else if (level === "medium") {
    caption =
      source.kind === "live_api"
        ? `${label}: MEDIUM — live data stale or missing fetch time; verify PassioGo / SOC / dining portal.`
        : `${label}: MEDIUM — static or snapshot; confirm on the official Rutgers source.`;
  } else {
    caption = `${label}: LOW — heuristic or opinion; not a verified campus fact.`;
  }

  return { id: source.id, domain: source.domain, level, caption };
}

/** Text block appended to the model user message (constitution references this). */
export function formatTruthLayerBlock(sources: TruthLayerSource[], now = new Date()): string {
  if (!sources.length) {
    return [
      "Truth-Layer (app-computed):",
      "- No structured sources were attached; treat factual campus claims as MEDIUM at best and tell the user to verify on official sites.",
    ].join("\n");
  }
  const rows = sources.map((s) => describeTruthLayerRow(s, now));
  const overall = aggregateTruthConfidence(rows.map((r) => r.level));
  const lines = [
    "Truth-Layer (app-computed — calibrate your answer and final Truth confidence line to this):",
    `Overall factual ceiling: ${overall.toUpperCase()}`,
    ...rows.map((r) => `- [${r.level.toUpperCase()}] ${r.caption}`),
  ];
  return lines.join("\n");
}
