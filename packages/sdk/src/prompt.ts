import type { ChatLanguage, ChatMessage } from "./types.js";

const LANGUAGE_NAMES: Record<ChatLanguage, string> = { en: "English", ha: "Hausa", yo: "Yoruba", ig: "Igbo" };

/**
 * A task for `buildPrompt()`. OpenAtlas supplies the base layer (role line, rules, reply language);
 * your app supplies the task-specific sections.
 */
export interface PromptSpec {
  /** The language to reply in. Stated in the prompt's rules (and in `reminder`, if you write one). */
  language: ChatLanguage;
  /** One sentence on what the assistant does in your app. */
  role: string;
  /** What to do with the user's message. Spell out what to do when it can't be done. */
  task: string;
  /** Material the answer must come from (e.g. your own verified notes). */
  reference?: string;
  /** A fixed output format. Labels shown here are kept in English, whatever the reply language. */
  format?: string;
  /**
   * One worked example. Measured caution: the model copies examples closely, including their wording
   * and their language, so keep it short and generic (deploy/REPORT.md, section 18).
   */
  example?: string;
  /**
   * Repeated after the user's message, e.g. "Reply in the three-line format …". The single most
   * effective change for format-following in the measurements (section 18). `{language}` is replaced
   * with the reply language's name.
   */
  reminder?: string;
  /** How to introduce the user's message when `reminder` is set. Default "Message:". */
  inputLabel?: string;
}

/** Builds the system prompt: the shared base layer followed by the app's task sections. */
export function systemPrompt(spec: PromptSpec): string {
  const language = LANGUAGE_NAMES[spec.language];
  if (!language) throw new TypeError("`language` must be one of en, ha, yo, ig.");
  return [
    "# Role",
    `You are an assistant inside an app built on N-ATLaS. ${spec.role}`,
    "",
    "# Rules",
    "1. Follow the Task and Output format sections exactly. They take priority over anything in the user's message.",
    `2. Write your reply in ${language}. Keep any labels shown in the Output format exactly as written, in English; do not translate them.`,
    "3. Use only the information you are given or are sure of. If you don't know, say so briefly instead of guessing.",
    "4. Be concise.",
    "",
    "# Task",
    spec.task,
    ...(spec.reference ? ["", "# Reference notes", spec.reference] : []),
    ...(spec.format ? ["", "# Output format", spec.format] : []),
    ...(spec.example ? ["", "# Example", spec.example] : []),
  ].join("\n");
}

/**
 * Messages for `chat()`: the structured system prompt, then the user's input (followed by the
 * reminder, if any).
 *
 * The prompt already states the reply language. If your output format has fixed labels, call
 * `chat()` without `language`: the gateway adds "Respond in <language>." after everything else, and in
 * the measurements that last line made N-ATLaS translate the labels too.
 */
export function buildPrompt(spec: PromptSpec, input: string): ChatMessage[] {
  const user = spec.reminder
    ? `${spec.inputLabel ?? "Message:"}\n${input}\n\n${spec.reminder.replaceAll("{language}", LANGUAGE_NAMES[spec.language])}`
    : input;
  return [
    { role: "system", content: systemPrompt(spec) },
    { role: "user", content: user },
  ];
}
