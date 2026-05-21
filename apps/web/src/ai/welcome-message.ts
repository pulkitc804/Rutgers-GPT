/**
 * First-session copy for the Scarlet Oracle (no PII; optional display name from local/session only).
 */

export type OracleWelcomeParams = {
  /** From local/session only — never from the model */
  displayName?: string | null;
};

function timeOfDay(d: Date): "morning" | "afternoon" | "evening" {
  const h = d.getHours();
  if (h < 12) return "morning";
  if (h < 17) return "afternoon";
  return "evening";
}

/** Short greeting only — live data is shown in the campus drawer, not the welcome bubble. */
export function buildOracleWelcomeMessage(params: OracleWelcomeParams = {}, now = new Date()): string {
  const pod = timeOfDay(now);
  const name = params.displayName?.trim();
  if (name) return `Good ${pod}, ${name}.`;
  return `Good ${pod}, Scarlet Knight.`;
}
