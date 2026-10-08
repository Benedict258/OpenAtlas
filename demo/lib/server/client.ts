import { OpenAtlas } from "@openatlas/sdk";

/**
 * The one SDK client, created on the server with the key passed explicitly.
 * Server-only: never import this from a client component.
 */

let client: OpenAtlas | null = null;

export function isMock(): boolean {
  return process.env.DEMO_MOCK === "1";
}

export function hasApiKey(): boolean {
  return Boolean(process.env.OPENATLAS_API_KEY);
}

export function getClient(): OpenAtlas {
  if (!client) {
    client = new OpenAtlas({
      apiKey: process.env.OPENATLAS_API_KEY,
      baseURL: process.env.OPENATLAS_BASE_URL || undefined,
    });
  }
  return client;
}
