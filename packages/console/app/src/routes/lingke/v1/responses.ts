import type { APIEvent } from "@solidjs/start/server"
import { handler } from "../../util/handler"

export async function POST(event: APIEvent) {
  return handler(event, {
    format: "anthropic",
    parseModel: (_url: string, body: any) => body.model,
    parseApiKey: (headers: Headers) => {
      return headers.get("x-api-key") ?? headers.get("Authorization")?.replace("Bearer ", "") ?? undefined
    },
    parseIsStream: (_url: string, body: any) => {
      return body.stream === true
    },
  })
}