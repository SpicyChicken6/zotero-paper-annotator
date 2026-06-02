import { config, homepage } from "../../package.json";
import { getPref } from "../utils/prefs";

const VALID_CATEGORIES = [
  "key_finding",
  "methodology",
  "conclusion",
  "limitation",
] as const;

type AnnotationCategory = (typeof VALID_CATEGORIES)[number];

const OPENROUTER_BASE_URL = "https://openrouter.ai/api";
const CHAT_COMPLETIONS_PATH = "/v1/chat/completions";
const JSON_MODE_HELP =
  "If using OpenRouter, choose a model that supports JSON response_format; support varies by model.";

interface LLMAnnotation {
  page: number;
  quote: string;
  category: AnnotationCategory;
  note: string;
}

interface LLMResponse {
  summary: string;
  annotations: LLMAnnotation[];
}

const SYSTEM_PROMPT = `You are an expert academic paper annotator. Given the full text of an academic paper, identify the most important passages and provide a structured analysis.

Return a JSON object with exactly this structure:
{
  "summary": "A 2-3 sentence overall summary of the paper's main contribution and findings.",
  "annotations": [
    {
      "page": <page number as integer>,
      "quote": "<exact text from the paper to highlight — must be a verbatim substring>",
      "category": "<one of: key_finding, methodology, conclusion, limitation>",
      "note": "<1-2 sentence explanation of why this passage is important>"
    }
  ]
}

Rules:
- The "quote" field MUST be an exact, verbatim substring from the paper text. Do not paraphrase.
- Keep quotes to 1-3 sentences. Do not quote entire paragraphs.
- Include 10-20 annotations covering the most important passages.
- Categories: key_finding (important results), methodology (methods/design), conclusion (implications), limitation (caveats/limitations).
- Return ONLY valid JSON. No markdown, no explanation outside the JSON.`;

function parseAnnotationResponse(raw: string): LLMResponse {
  let parsed: unknown;
  try {
    let cleaned = raw.trim();
    if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
    }
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Invalid JSON in LLM response: ${raw.slice(0, 100)}. ${JSON_MODE_HELP}`,
    );
  }

  const obj = parsed as Record<string, unknown>;

  if (typeof obj.summary !== "string" || obj.summary.length === 0) {
    throw new Error("LLM response missing summary");
  }

  if (!Array.isArray(obj.annotations)) {
    throw new Error("LLM response annotations must be an array");
  }

  const validAnnotations: LLMAnnotation[] = obj.annotations
    .filter((a: Record<string, unknown>) => {
      return (
        typeof a.page === "number" &&
        typeof a.quote === "string" &&
        typeof a.category === "string" &&
        typeof a.note === "string" &&
        (VALID_CATEGORIES as readonly string[]).includes(a.category)
      );
    })
    .map((a: Record<string, unknown>) => ({
      page: a.page as number,
      quote: a.quote as string,
      category: a.category as AnnotationCategory,
      note: a.note as string,
    }));

  return {
    summary: obj.summary,
    annotations: validAnnotations,
  };
}

function isLocalHttpHost(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "[::1]"
  );
}

function createInvalidBaseUrlError(baseUrl: string) {
  return new Error(
    `Invalid API base URL. For OpenRouter, use ${OPENROUTER_BASE_URL}; the plugin adds ${CHAT_COMPLETIONS_PATH} automatically. HTTPS is required except for http://localhost. Got: ${baseUrl}`,
  );
}

function normalizeApiBaseUrl(rawBaseUrl: string) {
  const baseUrl = rawBaseUrl.trim();
  let parsed: URL;
  try {
    parsed = new URL(baseUrl);
  } catch {
    throw createInvalidBaseUrlError(rawBaseUrl);
  }

  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && isLocalHttpHost(parsed.hostname))
  ) {
    throw createInvalidBaseUrlError(rawBaseUrl);
  }

  parsed.hash = "";
  parsed.search = "";
  return parsed;
}

function buildChatCompletionsUrl(rawBaseUrl: string) {
  const url = normalizeApiBaseUrl(rawBaseUrl);
  const path = url.pathname.replace(/\/+$/, "");

  if (path.endsWith(CHAT_COMPLETIONS_PATH)) {
    url.pathname = path;
  } else if (path.endsWith("/v1")) {
    url.pathname = `${path}/chat/completions`;
  } else {
    url.pathname = `${path}${CHAT_COMPLETIONS_PATH}`;
  }

  return url.toString();
}

function isOpenRouterUrl(url: string) {
  return new URL(url).hostname === "openrouter.ai";
}

function buildRequestHeaders(apiKey: string, url: string) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
  };

  if (isOpenRouterUrl(url)) {
    if (/^https?:\/\//.test(homepage)) {
      headers["HTTP-Referer"] = homepage;
    }
    headers["X-OpenRouter-Title"] = config.addonName;
  }

  return headers;
}

function createAbortController(): AbortController | undefined {
  const Controller = (globalThis as any).AbortController;
  return typeof Controller === "function" ? new Controller() : undefined;
}

function isAbortError(err: unknown) {
  return (
    (typeof DOMException !== "undefined" &&
      err instanceof DOMException &&
      err.name === "AbortError") ||
    (typeof err === "object" &&
      err !== null &&
      (err as { name?: string }).name === "AbortError")
  );
}

async function callLLM(paperText: string): Promise<LLMResponse> {
  const apiKey = getPref("apiKey");
  const baseUrl = getPref("apiBaseUrl");
  const model = getPref("modelName");

  const url = buildChatCompletionsUrl(baseUrl);

  const controller = createAbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let response: Response;
  try {
    const requestInit: RequestInit = {
      method: "POST",
      headers: buildRequestHeaders(apiKey, url),
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: paperText },
        ],
        response_format: { type: "json_object" },
        temperature: 0.1,
      }),
    };
    if (controller) {
      requestInit.signal = controller.signal;
    }

    const timeoutPromise = new Promise<Response>((_, reject) => {
      timeoutId = setTimeout(() => {
        controller?.abort();
        reject(new Error("LLM request timed out after 120 seconds"));
      }, 120_000);
    });

    response = await Promise.race([fetch(url, requestInit), timeoutPromise]);
  } catch (err) {
    if (isAbortError(err)) {
      throw new Error("LLM request timed out after 120 seconds");
    }
    throw err;
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `LLM API error (${response.status}): ${errorText.slice(0, 200)}. ${JSON_MODE_HELP}`,
    );
  }

  const data = (await response.json()) as unknown as {
    choices: Array<{ message: { content: string } }>;
  };

  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("LLM API returned empty response");
  }

  return parseAnnotationResponse(content);
}

export { callLLM, parseAnnotationResponse, SYSTEM_PROMPT, VALID_CATEGORIES };
export type { LLMAnnotation, LLMResponse, AnnotationCategory };
