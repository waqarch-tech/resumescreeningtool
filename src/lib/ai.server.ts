// Server-only Lovable AI Gateway helpers (chat completions + embeddings).
const BASE = "https://ai.gateway.lovable.dev/v1";

function key() {
  const k = process.env.LOVABLE_API_KEY;
  if (!k) throw new Error("Missing LOVABLE_API_KEY");
  return k;
}

export async function chat(opts: {
  model?: string;
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  json?: boolean;
  temperature?: number;
}): Promise<string> {
  const body: Record<string, unknown> = {
    model: opts.model ?? "google/gemini-3-flash-preview",
    messages: opts.messages,
  };
  if (opts.json) body.response_format = { type: "json_object" };
  if (opts.temperature != null) body.temperature = opts.temperature;

  const res = await fetch(`${BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key(),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`AI ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data?.choices?.[0]?.message?.content ?? "";
}

export async function chatJson<T>(opts: {
  model?: string;
  system?: string;
  prompt: string;
}): Promise<T> {
  const text = await chat({
    model: opts.model,
    messages: [
      {
        role: "system",
        content:
          (opts.system ?? "You are a helpful assistant.") +
          " Always respond with strict valid JSON only, no markdown fences.",
      },
      { role: "user", content: opts.prompt },
    ],
    json: true,
    temperature: 0.2,
  });
  // Strip code fences if model added them anyway
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();
  return JSON.parse(cleaned) as T;
}

export async function embed(input: string): Promise<number[]> {
  const res = await fetch(`${BASE}/embeddings`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Lovable-API-Key": key(),
    },
    body: JSON.stringify({
      model: "openai/text-embedding-3-small",
      input: input.slice(0, 30000),
      dimensions: 1536,
    }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Embed ${res.status}: ${text.slice(0, 300)}`);
  }
  const data = await res.json();
  return data.data[0].embedding as number[];
}

export function cosine(a: number[], b: number[]): number {
  let dot = 0,
    na = 0,
    nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (!na || !nb) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
