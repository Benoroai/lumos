import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * AI translation provider abstraction.
 *
 * Providers are swapped through `AI_TRANSLATION_PROVIDER`; keys stay server
 * side and are never referenced from a client component. The `echo` provider
 * is a deterministic offline stub so development, CI and tests never depend on
 * a paid API being reachable.
 */

export type TranslationField = "name" | "description" | "ingredients";

export type TranslationRequest = {
  sourceLocale: string;
  targetLocale: string;
  /** Field name → source text. Empty fields are skipped by the caller. */
  fields: Partial<Record<TranslationField, string>>;
  /** Short hint such as "restaurant dish name" to steer register and length. */
  context?: string;
};

export type TranslationResponse = {
  fields: Partial<Record<TranslationField, string>>;
  provider: string;
  model: string;
};

export interface TranslationProvider {
  readonly name: string;
  readonly model: string;
  translate(request: TranslationRequest): Promise<TranslationResponse>;
}

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English",
  ar: "Arabic",
  fa: "Persian (Farsi)",
  ur: "Urdu",
  hi: "Hindi",
  fr: "French",
  tr: "Turkish",
};

export function languageName(locale: string): string {
  return (
    LANGUAGE_NAMES[locale] ??
    LANGUAGE_NAMES[locale.split("-")[0] ?? locale] ??
    locale
  );
}

function buildPrompt(request: TranslationRequest): string {
  const entries = Object.entries(request.fields).filter(
    ([, v]) => v && v.trim().length > 0,
  );
  return [
    `Translate the following ${request.context ?? "catalog content"} from ${languageName(request.sourceLocale)} to ${languageName(request.targetLocale)}.`,
    "",
    "Rules:",
    "- Keep the tone of a customer-facing menu or service list.",
    "- Preserve proper nouns, brand names and measurements.",
    "- Do not add commentary, notes or explanations.",
    "- Return strict JSON with exactly the same keys as the input.",
    "",
    "Input JSON:",
    JSON.stringify(Object.fromEntries(entries), null, 2),
  ].join("\n");
}

function parseJsonFields(
  raw: string,
): Partial<Record<TranslationField, string>> {
  const jsonStart = raw.indexOf("{");
  const jsonEnd = raw.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd <= jsonStart)
    throw new Error("Provider returned no JSON object");

  const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as Record<
    string,
    unknown
  >;
  const out: Partial<Record<TranslationField, string>> = {};
  for (const field of ["name", "description", "ingredients"] as const) {
    const value = parsed[field];
    if (typeof value === "string") out[field] = value.trim();
  }
  return out;
}

class EchoProvider implements TranslationProvider {
  readonly name = "echo";
  readonly model = "offline-stub";

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const fields: Partial<Record<TranslationField, string>> = {};
    for (const [key, value] of Object.entries(request.fields)) {
      if (value && value.trim()) {
        fields[key as TranslationField] = `[${request.targetLocale}] ${value}`;
      }
    }
    return { fields, provider: this.name, model: this.model };
  }
}

class AnthropicProvider implements TranslationProvider {
  readonly name = "anthropic";
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": this.apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 1500,
        messages: [{ role: "user", content: buildPrompt(request) }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Anthropic translation failed (${response.status}): ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      content?: { type: string; text?: string }[];
    };
    const text = payload.content?.find((c) => c.type === "text")?.text ?? "";
    return {
      fields: parseJsonFields(text),
      provider: this.name,
      model: this.model,
    };
  }
}

class OpenAiProvider implements TranslationProvider {
  readonly name = "openai";
  constructor(
    private readonly apiKey: string,
    readonly model: string,
  ) {}

  async translate(request: TranslationRequest): Promise<TranslationResponse> {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${this.apiKey}`,
      },
      body: JSON.stringify({
        model: this.model,
        response_format: { type: "json_object" },
        messages: [{ role: "user", content: buildPrompt(request) }],
      }),
    });

    if (!response.ok) {
      throw new Error(
        `OpenAI translation failed (${response.status}): ${await response.text()}`,
      );
    }

    const payload = (await response.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = payload.choices?.[0]?.message?.content ?? "";
    return {
      fields: parseJsonFields(text),
      provider: this.name,
      model: this.model,
    };
  }
}

export function getTranslationProvider(): TranslationProvider {
  const env = serverEnv();
  switch (env.AI_TRANSLATION_PROVIDER) {
    case "anthropic":
      if (!env.ANTHROPIC_API_KEY) {
        console.warn(
          "[ai] ANTHROPIC_API_KEY is missing — falling back to the offline stub.",
        );
        return new EchoProvider();
      }
      return new AnthropicProvider(
        env.ANTHROPIC_API_KEY,
        env.AI_TRANSLATION_MODEL,
      );
    case "openai":
      if (!env.OPENAI_API_KEY) {
        console.warn(
          "[ai] OPENAI_API_KEY is missing — falling back to the offline stub.",
        );
        return new EchoProvider();
      }
      return new OpenAiProvider(env.OPENAI_API_KEY, env.AI_TRANSLATION_MODEL);
    case "echo":
    default:
      return new EchoProvider();
  }
}
