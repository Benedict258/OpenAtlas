import type { NextRequest } from "next/server";
import type { SpeakLanguage } from "@openatlas/sdk";
import { guardModelRoute, jsonError, mapSdkError } from "@/lib/server/api";
import { getClient, isMock } from "@/lib/server/client";
import { mockSpeak } from "@/lib/server/mock";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const LANGUAGES = new Set(["en", "ha", "yo", "ig", "pcm"]);
const ENGINES = new Set(["auto", "sorotts", "mms"]);
const MAX_TEXT = 1000;

export async function POST(request: NextRequest) {
  const auth = await guardModelRoute();
  if (typeof auth !== "string") return auth;

  const body: unknown = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return jsonError("bad_request", 400, "invalid JSON body");
  const { text, language, engine } = body as Record<string, unknown>;

  if (typeof text !== "string" || !text.trim()) return jsonError("bad_request", 400, "text is required");
  if (text.length > MAX_TEXT) return jsonError("text_too_long", 413, "text over 1000 characters");
  if (typeof language !== "string" || !LANGUAGES.has(language)) {
    return jsonError("bad_request", 400, "unsupported language");
  }
  let eng: "auto" | "sorotts" | "mms" | undefined;
  if (engine !== undefined && engine !== null && engine !== "") {
    if (typeof engine !== "string" || !ENGINES.has(engine)) {
      return jsonError("bad_request", 400, "unsupported engine");
    }
    eng = engine as "auto" | "sorotts" | "mms";
  }

  if (isMock()) {
    const { audio, ...rest } = mockSpeak(language);
    return Response.json({
      ok: true,
      mock: true,
      ...rest,
      audioBase64: Buffer.from(audio).toString("base64"),
    });
  }

  try {
    const res = await getClient().speak({
      text,
      language: language as SpeakLanguage,
      engine: eng,
      user: auth,
    });
    const { audio, ...rest } = res;
    return Response.json({
      ok: true,
      mock: false,
      ...rest,
      audioBase64: Buffer.from(audio).toString("base64"),
    });
  } catch (err) {
    return mapSdkError(err);
  }
}
