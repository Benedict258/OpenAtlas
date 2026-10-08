import type { NextRequest } from "next/server";
import type { ChatMessage, ChatLanguage } from "@openatlas/sdk";
import { guardModelRoute, jsonError, mapSdkError } from "@/lib/server/api";
import { getClient, isMock } from "@/lib/server/client";
import { mockChat } from "@/lib/server/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const CHAT_LANGUAGES = new Set(["en", "ha", "yo", "ig"]);
const ROLES = new Set(["system", "user", "assistant"]);
const MAX_MESSAGES = 80;
const MAX_CONTENT = 8000;

function lastUserText(messages: ChatMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") return messages[i].content;
  }
  return "";
}

export async function POST(request: NextRequest) {
  const auth = await guardModelRoute();
  if (typeof auth !== "string") return auth;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("bad_request", 400, "invalid JSON body");
  const { messages, language, max_tokens, temperature } = body as Record<string, unknown>;

  if (!Array.isArray(messages) || messages.length === 0 || messages.length > MAX_MESSAGES) {
    return jsonError("bad_request", 400, "messages must be a non-empty array (max 80)");
  }
  const parsed: ChatMessage[] = [];
  for (const m of messages) {
    if (!m || typeof m !== "object") return jsonError("bad_request", 400, "bad message");
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (typeof role !== "string" || !ROLES.has(role)) return jsonError("bad_request", 400, "bad role");
    if (typeof content !== "string" || !content.trim() || content.length > MAX_CONTENT) {
      return jsonError("bad_request", 400, "bad content");
    }
    parsed.push({ role: role as ChatMessage["role"], content });
  }

  let lang: ChatLanguage | undefined;
  if (language !== undefined && language !== null && language !== "") {
    if (typeof language !== "string" || !CHAT_LANGUAGES.has(language)) {
      return jsonError("bad_request", 400, "unsupported language");
    }
    lang = language as ChatLanguage;
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

  if (isMock()) {
    return Response.json({ ok: true, mock: true, ...mockChat(lastUserText(parsed)) });
  }

  try {
    const res = await getClient().chat({
      messages: parsed,
      language: lang,
      max_tokens: tokens,
      temperature: temp,
      user: auth,
    });
    return Response.json({ ok: true, mock: false, ...res });
  } catch (err) {
    return mapSdkError(err);
  }
}
