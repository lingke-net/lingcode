import type { APIEvent } from "@solidjs/start/server"

const SUPPORTED_MODELS = [
  "claude-sonnet-4-5",
  "claude-sonnet-4",
  "claude-sonnet-3-7",
  "claude-haiku-4",
  "claude-haiku-3-5",
  "gpt-5",
  "gpt-4o",
  "gpt-4o-mini",
  "gpt-4-turbo",
  "gpt-4",
  "gemini-2-5-pro",
  "gemini-2-5-flash",
  "gemini-2-0-flash",
  "gemini-1-5-pro",
  "gemini-1-5-flash",
  "deepseek-chat",
  "deepseek-coder",
]

export async function GET(event: APIEvent) {
  const models = SUPPORTED_MODELS.map((id) => ({
    id,
    object: "model",
    created: Date.now(),
    owned_by: "lingke",
    permission: [],
    root: id,
  }))

  return new Response(JSON.stringify({ object: "list", data: models }), {
    headers: { "Content-Type": "application/json" },
  })
}