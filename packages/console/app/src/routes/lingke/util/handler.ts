import type { APIEvent } from "@solidjs/start/server"
import { and, Database, eq, isNull, sql } from "@opencode-ai/console-core/drizzle/index.js"
import { KeyTable } from "@opencode-ai/console-core/schema/key.sql.js"
import { BillingTable } from "@opencode-ai/console-core/schema/billing.sql.js"
import { centsToMicroCents } from "@opencode-ai/console-core/util/price.js"
import { WorkspaceTable } from "@opencode-ai/console-core/schema/workspace.sql.js"
import { Billing } from "@opencode-ai/console-core/billing.js"
import { Actor } from "@opencode-ai/console-core/actor.js"
import { UserTable } from "@opencode-ai/console-core/schema/user.sql.js"
import { logger } from "./logger"
import {
  AuthError,
  CreditsError,
  MonthlyLimitError,
  ModelError,
  RateLimitError,
} from "./error"
import { createRateLimiter as createIpRateLimiter } from "./ipRateLimiter"
import { createRateLimiter as createKeyRateLimiter } from "./keyRateLimiter"
import { Resource } from "@opencode-ai/console-resource"

// Lingke API base URL - configurable via environment
const LINGKE_API_BASE = process.env.LINGKE_API_BASE_URL ?? "https://ai.lingke.ink/v1"

// API key prompt message - Chinese version for chat display
const API_KEY_PROMPT = "您需要前往 https://ai.lingke.ink/console/token 获取你的密钥并设置后才能使用此模型"

type BillingSource = "anonymous" | "free" | "byok" | "subscription" | "balance"

// Model mapping - auto-detect and map models to Lingke models
const MODEL_MAPPING: Record<string, string> = {
  // Kimi Models
  "moonshotai/Kimi-K2-Instruct-0905": "moonshotai/Kimi-K2-Instruct-0905",
  // GLM Models
  "Pro/zai-org/GLM-4.7": "Pro/zai-org/GLM-4.7",
  // Qwen Models
  "Qwen/Qwen3-14B": "Qwen/Qwen3-14B",
  // GPT Models
  "gpt-5.4-mini-ca": "gpt-5.4-mini-ca",
  "gpt-3.5-turbo": "gpt-3.5-turbo",
  // DeepSeek Models
  "deepseek-v4-pro": "deepseek-v4-pro",
  "deepseek-v4-flash": "deepseek-v4-flash",
  "deepseek-r1-0528": "deepseek-r1-0528",
  "deepseek-ai/DeepSeek-V3.2": "deepseek-ai/DeepSeek-V3.2",
  "deepseek-ai/DeepSeek-V3.1-Terminus": "deepseek-ai/DeepSeek-V3.1-Terminus",
}

// Supported models by Lingke
const SUPPORTED_MODELS = Object.keys(MODEL_MAPPING)

function resolve(text: string, params?: Record<string, string | number>) {
  if (!params) return text
  return text.replace(/\{\{(\w+)\}\}/g, (raw, key) => {
    const value = params[key]
    if (value === undefined || value === null) return raw
    return String(value)
  })
}

function getLingkeModel(modelId: string): string {
  // First try exact match
  if (MODEL_MAPPING[modelId]) {
    return MODEL_MAPPING[modelId]
  }
  
  // Try prefix match for variants
  for (const [key, value] of Object.entries(MODEL_MAPPING)) {
    if (modelId.startsWith(key)) {
      return value
    }
  }
  
  // Return original if no mapping found - Lingke will handle validation
  return modelId
}

function autoDetectModel(body: any): string | null {
  // Try to detect model from request body
  if (body.model) {
    return body.model
  }
  
  // Try to detect from messages context
  if (body.messages && Array.isArray(body.messages)) {
    // Default to gpt-4o-mini for coding tasks if no model specified
    return "gpt-4o-mini"
  }
  
  return null
}

export async function handler(
  input: APIEvent,
  opts: {
    format: "openai" | "anthropic" | "google" | "oa-compat"
    parseModel: (url: string, body: any) => string
    parseApiKey: (headers: Headers) => string | undefined
    parseIsStream: (url: string, body: any) => boolean
  },
) {
  type AuthInfo = Awaited<ReturnType<typeof authenticate>>
  
  const ADMIN_WORKSPACES = [
    "wrk_01K46JDFR0E75SG2Q8K172KF3Y", // anomaly
    "wrk_01K6W1A3VE0KMNVSCQT43BG2SX", // benchmark
    "wrk_01KKZDKDWCS1VTJF8QTX62DD50", // contributors
  ]

  try {
    const url = input.request.url
    const body = await input.request.json()
    const model = opts.parseModel(url, body)
    const isStream = opts.parseIsStream(url, body)
    const rawIp = input.request.headers.get("x-real-ip") ?? ""
    const ip = rawIp.includes(":") ? rawIp.split(":").slice(0, 4).join(":") : rawIp
    const rawLingkeApiKey = opts.parseApiKey(input.request.headers)
    const lingkeApiKey = rawLingkeApiKey === "public" ? undefined : rawLingkeApiKey
    const sessionId = input.request.headers.get("x-opencode-session") ?? ""
    const requestId = input.request.headers.get("x-opencode-request") ?? ""
    const projectId = input.request.headers.get("x-opencode-project") ?? ""
    
    logger.metric({
      is_stream: isStream,
      session: sessionId,
      request: requestId,
    })

    // Auto-detect model if needed
    const requestedModel = model || autoDetectModel(body)
    if (!requestedModel) {
      throw new ModelError("Model not specified. Please provide a model ID.")
    }

    // Map model to Lingke format
    const lingkeModel = getLingkeModel(requestedModel)

    // Create rate limiter
    const rateLimiter = lingkeApiKey
      ? createKeyRateLimiter(requestedModel, lingkeApiKey, input.request)
      : createIpRateLimiter(requestedModel, 10, ip, input.request)
    await rateLimiter?.check()

    // Authenticate
    const authInfo = await authenticate(requestedModel, lingkeApiKey)
    const billingSource = validateBilling(authInfo)

    // Build request to Lingke API - use /v1/chat/completions for OpenAI format
    const lingkeUrl = `${LINGKE_API_BASE}/chat/completions`
    
    // Prepare headers
    const headers = new Headers()
    headers.set("Content-Type", "application/json")
    if (lingkeApiKey) {
      headers.set("Authorization", `Bearer ${lingkeApiKey}`)
    }
    headers.set("User-Agent", `lingke-coding/${Resource.App.version || "1.0.0"}`)
    // Add anthropic-version header for Claude format support
    headers.set("anthropic-version", "2023-06-01")
    
    // Prepare body - pass through with model mapping
    const reqBody = JSON.stringify({
      ...body,
      model: lingkeModel,
    })

    logger.debug("LINGKE REQUEST URL: " + lingkeUrl)
    logger.debug("LINGKE REQUEST MODEL: " + lingkeModel)

    // Make request to Lingke API
    const res = await fetch(lingkeUrl, {
      method: "POST",
      headers,
      body: reqBody,
    })

    if (res.status !== 200) {
      logger.metric({
        "llm.error.code": res.status,
        "llm.error.message": res.statusText,
      })
    }

    // Scrub response headers
    const resHeaders = new Headers()
    const keepHeaders = ["content-type", "cache-control"]
    for (const [k, v] of res.headers.entries()) {
      if (keepHeaders.includes(k.toLowerCase())) {
        resHeaders.set(k, v)
      }
    }

    // Handle non-streaming response
    if (!isStream || [400, 404, 429].includes(res.status)) {
      const json = await res.json()
      await rateLimiter?.track()
      
      if (json.error?.message) {
        json.error.message = `Lingke API Error: ${json.error.message}`
      }
      
      const responseBody = JSON.stringify(json)
      logger.debug("LINGKE RESPONSE: " + responseBody)
      
      return new Response(responseBody, {
        status: res.status,
        statusText: res.statusText,
        headers: resHeaders,
      })
    }

    // Handle streaming response
    const stream = new ReadableStream({
      start(c) {
        const reader = res.body?.getReader()
        const decoder = new TextDecoder()
        const encoder = new TextEncoder()

        let buffer = ""
        let responseLength = 0

        function pump(): Promise<void> {
          return (
            reader?.read().then(async ({ done, value: rawValue }) => {
              if (done) {
                logger.metric({ response_length: responseLength })
                await rateLimiter?.track()
                c.close()
                return
              }

              responseLength += rawValue.length
              buffer += decoder.decode(rawValue, { stream: true })

              const parts = buffer.split("\n")
              buffer = parts.pop() ?? ""

              for (let part of parts) {
                logger.debug("LINGKE PART: " + part)
                if (part.trim()) {
                  c.enqueue(encoder.encode(part + "\n"))
                }
              }

              return pump()
            }) || Promise.resolve()
          )
        }

        return pump()
      },
    })

    return new Response(stream, {
      status: res.status,
      statusText: res.statusText,
      headers: resHeaders,
    })
  } catch (error: any) {
    logger.metric({
      "error.type": error.constructor.name,
      "error.message": error.message,
      "error.cause": error.cause?.toString(),
    })

    if (error instanceof AuthError) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: {
            type: "authentication_error",
            message: API_KEY_PROMPT
          },
        }),
        { status: 401 },
      )
    }

    if (error instanceof ModelError) {
      return new Response(
        JSON.stringify({
          type: "error",
          error: { type: "invalid_request_error", message: error.message },
        }),
        { status: 400 },
      )
    }

    if (error instanceof RateLimitError) {
      const headers = new Headers()
      if (error.retryAfter) {
        headers.set("retry-after", String(error.retryAfter))
      }
      return new Response(
        JSON.stringify({
          type: "error",
          error: { type: "rate_limit_error", message: error.message },
        }),
        { status: 429, headers },
      )
    }

    return new Response(
      JSON.stringify({
        type: "error",
        error: {
          type: "internal_server_error",
          message: "Internal server error",
        },
      }),
      { status: 500 },
    )
  }

  async function authenticate(reqModel: string, lingkeApiKey?: string) {
    if (!lingkeApiKey) {
      throw new AuthError(API_KEY_PROMPT)
    }

    const data = await Database.use((tx) =>
      tx
        .select({
          apiKey: KeyTable.id,
          workspaceID: KeyTable.workspaceID,
          billing: {
            balance: BillingTable.balance,
            paymentMethodID: BillingTable.paymentMethodID,
            monthlyLimit: BillingTable.monthlyLimit,
            monthlyUsage: BillingTable.monthlyUsage,
            timeMonthlyUsageUpdated: BillingTable.timeMonthlyUsageUpdated,
            subscription: BillingTable.subscription,
          },
          user: {
            id: UserTable.id,
            monthlyLimit: UserTable.monthlyLimit,
            monthlyUsage: UserTable.monthlyUsage,
            timeMonthlyUsageUpdated: UserTable.timeMonthlyUsageUpdated,
          },
        })
        .from(KeyTable)
        .innerJoin(WorkspaceTable, eq(WorkspaceTable.id, KeyTable.workspaceID))
        .innerJoin(BillingTable, eq(BillingTable.workspaceID, KeyTable.workspaceID))
        .innerJoin(UserTable, and(eq(UserTable.workspaceID, KeyTable.workspaceID), eq(UserTable.id, KeyTable.userID)))
        .where(and(eq(KeyTable.key, lingkeApiKey), isNull(KeyTable.timeDeleted)))
        .then((rows) => rows[0]),
    )

    if (!data) {
      throw new AuthError(API_KEY_PROMPT)
    }

    logger.metric({
      api_key: data.apiKey,
      workspace: data.workspaceID,
    })

    return {
      apiKeyId: data.apiKey,
      workspaceID: data.workspaceID,
      billing: data.billing,
      user: data.user,
      isFree: ADMIN_WORKSPACES.includes(data.workspaceID),
    }
  }

  function validateBilling(authInfo: AuthInfo): BillingSource {
    if (!authInfo) return "anonymous"
    if (authInfo.isFree) return "free"

    const billing = authInfo.billing
    
    // Check if has valid billing
    if (!billing.paymentMethodID && billing.balance <= 0) {
      throw new CreditsError(`No credits available. Please add credits at https://ai.lingke.ink/console/billing`)
    }
    
    if (billing.balance <= 0) {
      throw new CreditsError(`Insufficient balance. Please add credits at https://ai.lingke.ink/console/billing`)
    }

    // Check monthly limits
    const now = new Date()
    const currentYear = now.getUTCFullYear()
    const currentMonth = now.getUTCMonth()
    
    if (
      billing.monthlyLimit &&
      billing.monthlyUsage &&
      billing.timeMonthlyUsageUpdated &&
      billing.monthlyUsage >= centsToMicroCents(billing.monthlyLimit * 100) &&
      currentYear === billing.timeMonthlyUsageUpdated.getUTCFullYear() &&
      currentMonth === billing.timeMonthlyUsageUpdated.getUTCMonth()
    ) {
      throw new MonthlyLimitError(
        `Monthly limit of $${billing.monthlyLimit} reached. Please upgrade at https://ai.lingke.ink/console/billing`,
      )
    }

    if (
      authInfo.user.monthlyLimit &&
      authInfo.user.monthlyUsage &&
      authInfo.user.timeMonthlyUsageUpdated &&
      authInfo.user.monthlyUsage >= centsToMicroCents(authInfo.user.monthlyLimit * 100) &&
      currentYear === authInfo.user.timeMonthlyUsageUpdated.getUTCFullYear() &&
      currentMonth === authInfo.user.timeMonthlyUsageUpdated.getUTCMonth()
    ) {
      throw new MonthlyLimitError(
        `User monthly limit of $${authInfo.user.monthlyLimit} reached.`,
      )
    }

    return "balance"
  }
}
