/**
 * Thin OpenRouter chat-completion client used by the remediation pipeline
 * for category re-classification + required-attribute extraction.
 *
 * OpenRouter is the project-wide LLM gateway per CLAUDE.md. The default
 * model is Claude Haiku 4.5 — cheap (≈$0.0003/req at our prompt sizes)
 * and fast enough to fan out across hundreds of products.
 */

const DEFAULT_MODEL = "anthropic/claude-haiku-4.5";
const ENDPOINT = "https://openrouter.ai/api/v1/chat/completions";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface OpenRouterCallOpts {
  model?: string;
  temperature?: number;
  max_tokens?: number;
  /** When true, the response_format is set to JSON; the caller must JSON.parse the content. */
  json?: boolean;
}

export class OpenRouterError extends Error {
  constructor(message: string, public status?: number) {
    super(message);
  }
}

export const callOpenRouter = async (
  messages: ChatMessage[],
  opts: OpenRouterCallOpts = {}
): Promise<string> => {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new OpenRouterError("OPENROUTER_API_KEY not set");
  const model = opts.model ?? process.env.OPENROUTER_MODEL ?? DEFAULT_MODEL;

  const body: Record<string, unknown> = {
    model,
    messages,
    temperature: opts.temperature ?? 0,
    max_tokens: opts.max_tokens ?? 800,
  };
  if (opts.json) {
    body.response_format = { type: "json_object" };
  }

  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "X-Title": "HaContainer SP Remediation",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new OpenRouterError(
      `OpenRouter ${res.status}: ${(await res.text()).slice(0, 400)}`,
      res.status
    );
  }
  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = json.choices?.[0]?.message?.content ?? "";
  if (!content) throw new OpenRouterError("OpenRouter returned no content");
  return content;
};

/** Helpful wrapper that parses JSON safely; throws on malformed output. */
export const callOpenRouterJson = async <T,>(
  messages: ChatMessage[],
  opts: OpenRouterCallOpts = {}
): Promise<T> => {
  const raw = await callOpenRouter(messages, { ...opts, json: true });
  // Models occasionally wrap JSON in markdown fences; strip them.
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try {
    return JSON.parse(cleaned) as T;
  } catch (e) {
    throw new OpenRouterError(`failed to parse JSON: ${(e as Error).message} -- raw=${raw.slice(0, 200)}`);
  }
};
