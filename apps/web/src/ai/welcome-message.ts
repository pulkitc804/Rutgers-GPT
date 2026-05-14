/**
 * First-session copy for the Scarlet Oracle (no PII; optional display name from local/session only).
 */

export type OracleWelcomeParams = {
  /** From local/session only — never from the model */
  displayName?: string | null;
  /** Short optional hints from live dashboard context */
  transitLine?: string | null;
  diningLine?: string | null;
};

/** Omit ugly error strings from the greeting chip line. */
export function sanitizeLiveSnippet(text: string | undefined | null): string | null {
  const t = text?.trim();
  if (!t) return null;
  if (/unavailable|HTTP\s*\d+|error:|failed|could not reach/i.test(t)) return null;
  return t.length > 180 ? `${t.slice(0, 177)}…` : t;
}

function timeOfDay(d: Date): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** Default first-open welcome; safe without any scraper data. */
export function buildOracleWelcomeMessage(params: OracleWelcomeParams = {}, now = new Date()): string {
  const pod = timeOfDay(now);
  const name = params.displayName?.trim();
  const hi = name ? `Good ${pod}, ${name}.` : `Good ${pod}.`;

  const bits: string[] = [];
  const transit = sanitizeLiveSnippet(params.transitLine);
  const dining = sanitizeLiveSnippet(params.diningLine);
  if (transit) bits.push(transit);
  if (dining) bits.push(dining);

  const hook =
    bits.length > 0
      ? ` ${bits.join(" ")} Want a quick read on classes, buses, and food for today?`
      : " Open Live campus (top right) and tap Refresh so I can attach real bus, dining, and class snapshots — then ask me anything.";

  return `${hi}${hook}`;
}
