import type { APIEvent } from "@solidjs/start/server"
import { handler } from "../../../util/handler"

export async function POST(event: APIEvent) {
  return handler(event, {
    format: "openai",
    parseModel: (url: string, body: any) => {
      const match = url.match(/\/go\/v1\/chat\/models\/([^/]+)\/completions/)
      if (match) return match[1]
      return body.model
    },
    parseApiKey: (headers: Headers) => {
      return headers.get("Authorization")?.replace("Bearer ", "") ?? headers.get("x-api-key") ?? undefined
    },
    parseIsStream: (_url: string, body: any) => {
      return body.stream === true
    },
  })
}