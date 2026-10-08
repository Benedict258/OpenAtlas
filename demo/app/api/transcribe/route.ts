import type { NextRequest } from "next/server";
import type { TranscribeLanguage } from "@openatlas/sdk";
import { guardModelRoute, jsonError, mapSdkError } from "@/lib/server/api";
import { getClient, isMock } from "@/lib/server/client";
import { mockTranscribe } from "@/lib/server/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LANGUAGES = new Set(["en-ng", "ha", "yo", "ig"]);
const MAX_AUDIO_BYTES = 7 * 1024 * 1024;

export async function POST(request: NextRequest) {
  const auth = await guardModelRoute();
  if (typeof auth !== "string") return auth;

  const form = await request.formData().catch(() => null);
  if (!form) return jsonError("bad_request", 400, "expected multipart form data");

  const language = form.get("language");
  if (typeof language !== "string" || !LANGUAGES.has(language)) {
    return jsonError("bad_request", 400, "unsupported language");
  }

  const audio = form.get("audio");
  if (!(audio instanceof File) || audio.size === 0) {
    return jsonError("bad_request", 400, "audio file is required");
  }
  if (audio.size > MAX_AUDIO_BYTES) {
    return jsonError("audio_too_large", 413, `audio is ${audio.size} bytes`);
  }

  const bytes = await audio.arrayBuffer();

  if (isMock()) {
    return Response.json({ ok: true, mock: true, ...mockTranscribe(language) });
  }

  try {
    const res = await getClient().transcribe({
      audio: bytes,
      language: language as TranscribeLanguage,
      user: auth,
    });
    return Response.json({ ok: true, mock: false, ...res });
  } catch (err) {
    return mapSdkError(err);
  }
}
