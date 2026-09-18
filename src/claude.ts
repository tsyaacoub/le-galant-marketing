import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodType } from "zod/v4";
import { config } from "./config.js";

// Secrets pasted into GitHub sometimes carry line breaks or spaces; a key is one token.
const apiKey = process.env.ANTHROPIC_API_KEY?.replace(/\s+/g, "").match(/sk-ant-[A-Za-z0-9_-]{20,}/)?.[0];
export const client = new Anthropic(apiKey ? { apiKey } : {});

/**
 * One structured call. The system prompt is frozen brand text and is cached;
 * everything that changes per run goes in the user message, after it.
 */
export async function ask<T>(opts: {
  system: string;
  user: string;
  schema: ZodType<T>;
  effort: "low" | "medium" | "high";
  maxTokens?: number;
}): Promise<T> {
  try {
    const res = await client.messages.parse({
      model: config.model,
      max_tokens: opts.maxTokens ?? 16000,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
      output_config: { format: zodOutputFormat(opts.schema), effort: opts.effort },
    });
    if (res.stop_reason === "refusal") {
      throw new Error(`The model declined this request${res.stop_details?.explanation ? `: ${res.stop_details.explanation}` : ""}`);
    }
    if (res.stop_reason === "max_tokens") throw new Error("Output was cut off; raise maxTokens");
    if (!res.parsed_output) throw new Error("The model's answer did not match the schema");
    return res.parsed_output;
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) throw new Error("ANTHROPIC_API_KEY is missing or invalid");
    if (err instanceof Anthropic.RateLimitError) throw new Error("Rate limited by Anthropic; the next scheduled run will retry");
    if (err instanceof Anthropic.APIError) throw new Error(`Anthropic API error ${err.status}: ${err.message}`);
    throw err;
  }
}
