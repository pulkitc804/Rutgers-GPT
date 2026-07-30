import type { AgentActionIntent } from "@/lib/detect-action-intent";

/** Injected into every agent turn so small local models execute tools instead of link-dumping. */
export function buildExecutionContract(intent: AgentActionIntent, opts?: { hasPrecomputedPlan?: boolean }): string {
  const lines = [
    "EXECUTION_CONTRACT (mandatory — violating this is a failed response):",
    "- Answer the student's exact request with **concrete data** from tools or PRECOMPUTED_SOC_PLAN — not generic orientation.",
    "- FORBIDDEN unless the student asked about wellness: leading with CAPS, TimelyCare, NSO welcome links, or \"explore forums\".",
    "- FORBIDDEN: inventing bus ETAs, menus, section times, or campus locations.",
    "- Allowed links: only as citations next to a fact you already stated (SOC index, FoodPro URL, Passio).",
  ];

  if (intent.schedule.match) {
    if (opts?.hasPrecomputedPlan) {
      lines.push(
        "- Schedule: live SOC data is in PRECOMPUTED_SOC_PLAN / plan_term_schedule JSON. You are an intelligent advisor: explain what SOC is in one plain sentence, then synthesize a personalized plan (do NOT paste the raw block verbatim).",
        "- Include: course list with titles, open section counts, example section # + meeting times from the data, weekly grid if present, credit estimate, 2–3 registration steps.",
        "- If SOC shows no sections, say that honestly and tell them what to check on sis.rutgers.edu — never invent times.",
      );
    } else {
      lines.push(
        "- Schedule: you MUST call plan_term_schedule (or plan_multi_course_schedule) with year/term from the question before answering.",
      );
    }
  }
  if (intent.dining) {
    lines.push("- Dining: call get_dining_menu (or use verified dining snapshot) — state hall, campus, meal period, and menu highlights.");
  }
  if (intent.transit) {
    lines.push("- Transit: call get_live_transit — state stop IDs and ETAs from the tool only.");
  }
  if (intent.wellness) {
    lines.push("- Wellness: student asked for support resources — CAPS / Student Health / TimelyCare links are allowed.");
  }

  lines.push(
    "- Style: answer like a sharp upperclassman texting a friend — natural prose, lead with the answer. NO forced ### headers, NO mandatory \"Next steps\" section, and NEVER print a \"Truth confidence:\" line. Use light Markdown only when a multi-part answer (like a schedule) genuinely needs it.",
  );

  return lines.join("\n");
}

export const OLLAMA_FINAL_SYNTHESIS_USER = [
  "Write the final reply to the student now as a thoughtful Rutgers advisor (not a link dump).",
  "Ground every fact in tool results, PREFETCHED_TOOL_RESULTS, or PRECOMPUTED_SOC_PLAN in this thread.",
  "If they asked about schedules: briefly explain SOC = Rutgers Schedule of Classes (live section data from sis.rutgers.edu), then give YOUR synthesized plan.",
  "Include specific course codes, section numbers/indexes, meeting times, or ETAs when the data provides them.",
  "Personalize using their major, home campus, and course list from the profile when available.",
  "Write naturally, like a sharp upperclassman — NOT a template. No \"Lead\"/\"Body\" labels, no forced ### headers, no mandatory \"Next steps\" section, and NEVER end with a \"Truth confidence:\" line. Use light Markdown (a short header or a few bullets) only for genuinely multi-part answers like a weekly schedule.",
].join("\n");
