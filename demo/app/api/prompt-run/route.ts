import type { NextRequest } from "next/server";
import type { ChatLanguage, PromptSpec } from "@openatlas/sdk";
import { buildPrompt } from "@openatlas/sdk";
import { guardModelRoute, jsonError, mapSdkError } from "@/lib/server/api";
import { getClient, isMock } from "@/lib/server/client";
import { mockChat } from "@/lib/server/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAT_LANGUAGES = new Set(["en", "ha", "yo", "ig"]);

const LIMITS: Record<string, number> = {
  role: 500,
  task: 2000,
  reference: 4000,
  format: 1000,
  example: 1000,
  reminder: 500,
  inputLabel: 200,
};

export async function POST(request: NextRequest) {
  const auth = await guardModelRoute();
  if (typeof auth !== "string") return auth;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("bad_request", 400, "invalid JSON body");
  const { spec, input, max_tokens, temperature } = body as Record<string, unknown>;

  if (!spec || typeof spec !== "object") return jsonError("bad_request", 400, "spec is required");
  const raw = spec as Record<string, unknown>;

  if (typeof raw.language !== "string" || !CHAT_LANGUAGES.has(raw.language)) {
    return jsonError("bad_request", 400, "unsupported language");
  }
  for (const [field, limit] of Object.entries(LIMITS)) {
    const value = raw[field];
    if (value === undefined || value === null || value === "") continue;
    if (typeof value !== "string" || value.length > limit) {
      return jsonError("bad_request", 400, `${field} must be a string of at most ${limit} characters`);
    }
  }
  if (typeof raw.role !== "string" || !raw.role.trim()) {
    return jsonError("bad_request", 400, "spec.role is required");
  }
  if (typeof raw.task !== "string" || !raw.task.trim()) {
    return jsonError("bad_request", 400, "spec.task is required");
  }
  if (typeof input !== "string" || !input.trim() || input.length > 8000) {
    return jsonError("bad_request", 400, "input must be a non-empty string of at most 8000 characters");
  }

  let tokens: number | undefined;
  if (max_tokens !== undefined) {
    if (typeof max_tokens !== "number" || !Number.isFinite(max_tokens) || max_tokens < 1 || max_tokens > 1024) {
      return jsonError("bad_request", 400, "max_tokens must be 1..1024");
    }
    tokens = Math.floor(max_tokens);
  }
  let temp: number | undefined;
  if (temperature !== undefined) {
    if (typeof temperature !== "number" || !Number.isFinite(temperature) || temperature < 0 || temperature > 2) {
      return jsonError("bad_request", 400, "temperature must be 0..2");
    }
    temp = temperature;
  }

  const promptSpec: PromptSpec = {
    language: raw.language as ChatLanguage,
    role: raw.role.trim(),
    task: raw.task.trim(),
    ...(typeof raw.reference === "string" && raw.reference.trim() ? { reference: raw.reference } : {}),
    ...(typeof raw.format === "string" && raw.format.trim() ? { format: raw.format } : {}),
    ...(typeof raw.example === "string" && raw.example.trim() ? { example: raw.example } : {}),
    ...(typeof raw.reminder === "string" && raw.reminder.trim() ? { reminder: raw.reminder } : {}),
    ...(typeof raw.inputLabel === "string" && raw.inputLabel.trim() ? { inputLabel: raw.inputLabel } : {}),
  };

  const messages = buildPrompt(promptSpec, input);

  if (isMock()) {
    return Response.json({ ok: true, mock: true, ...mockChat(input) });
  }

  try {
    // No `language`: buildPrompt already states the reply language in the Rules, and
    // leaving it off keeps fixed output-format labels in English (prompt.d.ts).
    const res = await getClient().chat({
      messages,
      max_tokens: tokens,
      temperature: temp,
      user: auth,
    });
    return Response.json({ ok: true, mock: false, ...res });
  } catch (err) {
    return mapSdkError(err);
  }
}
