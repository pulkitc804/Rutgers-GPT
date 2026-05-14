import type { MessageParam } from "@anthropic-ai/sdk/resources/messages";

/**
 * Anthropic requires the first message to be from `user` and roles to alternate.
 * UI threads often start with an assistant greeting — strip it and merge duplicate roles.
 */
export function normalizeAnthropicTurns(raw: MessageParam[]): MessageParam[] {
  const cleaned = raw
    .map((m) => {
      const content = typeof m.content === "string" ? m.content.trim() : "";
      return {
        role: m.role as "user" | "assistant",
        content,
      };
    })
    .filter((m) => m.content.length > 0);

  let i = 0;
  while (i < cleaned.length && cleaned[i].role === "assistant") i++;
  const sliced = cleaned.slice(i);
  if (!sliced.length) {
    return [{ role: "user", content: "Hello." }];
  }

  const out: MessageParam[] = [];
  for (const m of sliced) {
    const prev = out[out.length - 1];
    if (prev && prev.role === m.role) {
      const a = typeof prev.content === "string" ? prev.content : "";
      prev.content = `${a}\n\n${m.content}`;
    } else {
      out.push({ role: m.role, content: m.content });
    }
  }
  if (out[0]?.role !== "user") {
    out.unshift({ role: "user", content: "Continue our Rutgers campus conversation." });
  }
  return out;
}
