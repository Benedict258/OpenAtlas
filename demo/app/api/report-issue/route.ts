import type { NextRequest } from "next/server";
import type { ReportIssueParams } from "@openatlas/sdk";
import { guardModelRoute, jsonError, mapSdkError } from "@/lib/server/api";
import { getClient, isMock } from "@/lib/server/client";
import { mockReportIssue } from "@/lib/server/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const KINDS = new Set(["chat", "transcription"]);
const LANGUAGES = new Set(["en", "en-ng", "ha", "yo", "ig"]);
const MAX_TEXT = 8000;
const MAX_NOTE = 1980;
const NOTE_PREFIX = "[demo-app]";

export async function POST(request: NextRequest) {
  const auth = await guardModelRoute();
  if (typeof auth !== "string") return auth;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("bad_request", 400, "invalid JSON body");
  const { kind, output, correction, input, language, note } = body as Record<string, unknown>;

  if (typeof kind !== "string" || !KINDS.has(kind)) {
    return jsonError("bad_request", 400, "kind must be chat or transcription");
  }
  if (typeof output !== "string" || !output.trim() || output.length > MAX_TEXT) {
    return jsonError("bad_request", 400, "output is required (max 8000 characters)");
  }
  if (typeof correction !== "string" || !correction.trim() || correction.length > MAX_TEXT) {
    return jsonError("bad_request", 400, "correction is required (max 8000 characters)");
  }
  if (kind === "chat" && (typeof input !== "string" || !input.trim() || input.length > MAX_TEXT)) {
    return jsonError("bad_request", 400, "input (the prompt) is required for chat issues");
  }
  if (language !== undefined && language !== null && language !== "") {
    if (typeof language !== "string" || !LANGUAGES.has(language)) {
      return jsonError("bad_request", 400, "unsupported language");
    }
  }
  if (note !== undefined && note !== null && note !== "") {
    if (typeof note !== "string" || note.length > MAX_NOTE) {
      return jsonError("bad_request", 400, `note must be at most ${MAX_NOTE} characters`);
    }
  }

  const params: ReportIssueParams = {
    kind: kind as "chat" | "transcription",
    output,
    correction,
    ...(typeof input === "string" && input.trim() ? { input } : {}),
    ...(typeof language === "string" && language ? { language: language as ReportIssueParams["language"] } : {}),
    note: typeof note === "string" && note.trim() ? `${NOTE_PREFIX} ${note.trim()}` : NOTE_PREFIX,
    user: auth,
  };

  if (isMock()) {
    return Response.json({ ok: true, mock: true, ...mockReportIssue() });
  }

  try {
    const res = await getClient().reportIssue(params);
    return Response.json({ ok: true, mock: false, ...res });
  } catch (err) {
    return mapSdkError(err);
  }
}
