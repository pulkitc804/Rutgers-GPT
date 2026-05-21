type OllamaChatMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
};

export type OllamaRequestOptions = {
  signal?: AbortSignal;
  /** Passed to Ollama as top-level `options` (temperature, num_predict, etc.). */
  generation?: Record<string, number>;
};

/**
 * Streams Ollama `/api/chat` NDJSON into raw UTF-8 text chunks (same shape as Anthropic route).
 */
export function createOllamaChatTextStream(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  requestOptions?: OllamaRequestOptions,
): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const generation = requestOptions?.generation;

  return new ReadableStream({
    async start(controller) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/api/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model,
            messages,
            stream: true,
            ...(generation && Object.keys(generation).length ? { options: generation } : {}),
          }),
          cache: "no-store",
          signal: requestOptions?.signal,
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Could not reach Ollama";
        controller.enqueue(encoder.encode(`\n\n[Ollama: ${msg}. Is Ollama running? Try: ollama serve]`));
        controller.close();
        return;
      }

      if (!res.ok) {
        const t = await res.text().catch(() => "");
        controller.enqueue(
          encoder.encode(
            `\n\n[Ollama HTTP ${res.status}${t ? `: ${t.slice(0, 400)}` : ""}]`,
          ),
        );
        controller.close();
        return;
      }

      const body = res.body;
      if (!body) {
        controller.enqueue(encoder.encode("\n\n[Ollama: empty response body]"));
        controller.close();
        return;
      }

      const reader = body.getReader();
      let buf = "";
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            let j: { message?: { content?: string } };
            try {
              j = JSON.parse(trimmed) as { message?: { content?: string } };
            } catch {
              continue;
            }
            const piece = j.message?.content;
            if (piece) controller.enqueue(encoder.encode(piece));
          }
        }
        const tail = buf.trim();
        if (tail) {
          try {
            const j = JSON.parse(tail) as { message?: { content?: string } };
            const piece = j.message?.content;
            if (piece) controller.enqueue(encoder.encode(piece));
          } catch {
            /* ignore trailing garbage */
          }
        }
        controller.close();
      } catch (e) {
        const msg = e instanceof Error ? e.message : "Stream read failed";
        controller.enqueue(encoder.encode(`\n\n[Ollama: ${msg}]`));
        controller.close();
      }
    },
  });
}

export type OllamaChatResponse = {
  message?: {
    role?: string;
    content?: string;
    tool_calls?: { function: { name: string; arguments: Record<string, unknown> | string } }[];
  };
};

export async function ollamaChatRaw(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  requestOptions?: OllamaRequestOptions & { tools?: unknown[] },
): Promise<{ ok: true; data: OllamaChatResponse } | { ok: false; status: number; error: string }> {
  let res: Response;
  const generation = requestOptions?.generation;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(requestOptions?.tools ? { tools: requestOptions.tools } : {}),
        ...(generation && Object.keys(generation).length ? { options: generation } : {}),
      }),
      cache: "no-store",
      signal: requestOptions?.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not reach Ollama";
    return { ok: false, status: 503, error: `${msg}. Is Ollama running?` };
  }

  const raw = await res.text();
  if (!res.ok) {
    return { ok: false, status: res.status, error: raw.slice(0, 800) || `HTTP ${res.status}` };
  }

  try {
    return { ok: true, data: JSON.parse(raw) as OllamaChatResponse };
  } catch {
    return { ok: false, status: 502, error: "Invalid JSON from Ollama" };
  }
}

export async function ollamaChatOnce(
  baseUrl: string,
  model: string,
  messages: OllamaChatMessage[],
  requestOptions?: OllamaRequestOptions,
): Promise<{ ok: true; text: string } | { ok: false; status: number; error: string }> {
  let res: Response;
  const generation = requestOptions?.generation;
  try {
    res = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        stream: false,
        ...(generation && Object.keys(generation).length ? { options: generation } : {}),
      }),
      cache: "no-store",
      signal: requestOptions?.signal,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not reach Ollama";
    return { ok: false, status: 503, error: `${msg}. Is Ollama running?` };
  }

  const raw = await res.text();
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: raw.slice(0, 800) || `HTTP ${res.status}`,
    };
  }

  try {
    const j = JSON.parse(raw) as { message?: { content?: string } };
    const text = (j.message?.content ?? "").trim();
    return { ok: true, text: text || "(No text returned)" };
  } catch {
    return { ok: false, status: 502, error: "Invalid JSON from Ollama" };
  }
}
