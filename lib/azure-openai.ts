import { AzureOpenAI } from "openai"

let _defaultClient: AzureOpenAI | null = null
const _deploymentClients = new Map<string, AzureOpenAI>()

/**
 * gpt-5.x family models on Azure are reasoning-style: they reject any
 * `temperature` value other than 1 with HTTP 400
 * `unsupported_value: temperature does not support N`. The design
 * pipeline has ~18 call-sites that pass thoughtful 0.3 / 0.7 / 0.5
 * literals (carried over from gpt-4 days); rather than rewrite each
 * one, this Proxy intercepts every chat.completions.create and
 * beta.chat.completions.parse call and forces `temperature: 1` (also
 * strips legacy `max_tokens` in favour of `max_completion_tokens`,
 * which the new family requires). When/if we move back to a non-
 * reasoning model, delete the Proxy and the literals start meaning
 * what they say again.
 */
function coerceReasoningParams<T extends Record<string, any>>(params: T): T {
  if (!params || typeof params !== "object") return params
  const out: any = { ...params }
  // Force temperature to 1 (only value reasoning models accept).
  if ("temperature" in out && out.temperature !== 1) out.temperature = 1
  // Translate the legacy `max_tokens` field. Reasoning models accept
  // `max_completion_tokens` only; passing both causes a 400.
  if ("max_tokens" in out && !("max_completion_tokens" in out)) {
    out.max_completion_tokens = out.max_tokens
    delete out.max_tokens
  }
  return out as T
}

function wrapForReasoningModel(client: AzureOpenAI): AzureOpenAI {
  // Two-level Proxy: top → chat.completions / beta.chat.completions →
  // (create | parse). The leaf wrapper coerces the first arg and forwards.
  const wrapCompletionsObj = (completions: any): any =>
    new Proxy(completions, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver)
        if (
          typeof v === "function" &&
          (key === "create" || key === "parse" || key === "stream")
        ) {
          return function (this: any, ...args: any[]) {
            if (args[0]) args[0] = coerceReasoningParams(args[0])
            return v.apply(this === receiver ? target : this, args)
          }
        }
        return v
      }
    })

  const wrapChatObj = (chat: any): any =>
    new Proxy(chat, {
      get(target, key, receiver) {
        const v = Reflect.get(target, key, receiver)
        if (key === "completions" && v && typeof v === "object") {
          return wrapCompletionsObj(v)
        }
        return v
      }
    })

  return new Proxy(client, {
    get(target, key, receiver) {
      const v = Reflect.get(target, key, receiver)
      if (key === "chat" && v && typeof v === "object") return wrapChatObj(v)
      if (key === "beta" && v && typeof v === "object") {
        return new Proxy(v, {
          get(b, k, br) {
            const sub = Reflect.get(b, k, br)
            if (k === "chat" && sub && typeof sub === "object") {
              return wrapChatObj(sub)
            }
            return sub
          }
        })
      }
      return v
    }
  }) as AzureOpenAI
}

function getEnv(name: string): string | undefined {
  return process.env[name]
}

function requireEnv(name: string): string {
  const v = getEnv(name)
  if (!v) throw new Error(`Missing required env var: ${name}`)
  return v
}

/**
 * Lazily creates a shared Azure OpenAI client using env vars:
 * - AZURE_OPENAI_KEY
 * - AZURE_OPENAI_ENDPOINT
 * - AZURE_OPENAI_API_VERSION
 * - AZURE_OPENAI_DEPLOYMENT
 */
export function getAzureOpenAI(): AzureOpenAI {
  if (_defaultClient) return _defaultClient

  // Support both names to reduce surprises (SDK defaults to AZURE_OPENAI_API_KEY)
  const apiKey = getEnv("AZURE_OPENAI_KEY") || getEnv("AZURE_OPENAI_API_KEY")
  if (!apiKey) {
    throw new Error(
      "Missing required env var: AZURE_OPENAI_KEY (or AZURE_OPENAI_API_KEY)"
    )
  }

  const endpoint = requireEnv("AZURE_OPENAI_ENDPOINT")
  const apiVersion = requireEnv("AZURE_OPENAI_API_VERSION")
  const deployment = requireEnv("AZURE_OPENAI_DEPLOYMENT")

  _defaultClient = wrapForReasoningModel(
    new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion,
      deployment
    })
  )

  return _defaultClient
}

export function getAzureOpenAIModel(): string {
  return requireEnv("AZURE_OPENAI_DEPLOYMENT")
}

export function getAzureOpenAIForDeployment(deployment: string): AzureOpenAI {
  const key = deployment.trim()
  if (!key) throw new Error("Azure OpenAI deployment name must be non-empty")

  const existing = _deploymentClients.get(key)
  if (existing) return existing

  const apiKey = getEnv("AZURE_OPENAI_KEY") || getEnv("AZURE_OPENAI_API_KEY")
  if (!apiKey) {
    throw new Error(
      "Missing required env var: AZURE_OPENAI_KEY (or AZURE_OPENAI_API_KEY)"
    )
  }

  const endpoint = requireEnv("AZURE_OPENAI_ENDPOINT")
  const apiVersion = requireEnv("AZURE_OPENAI_API_VERSION")

  const client = wrapForReasoningModel(
    new AzureOpenAI({
      apiKey,
      endpoint,
      apiVersion,
      deployment: key
    })
  )

  _deploymentClients.set(key, client)
  return client
}

// -----------------------------
// Design-module helpers
// (uses a separate deployment for better temperature control)
// -----------------------------

export function getDesignDeployment(): string {
  return (process.env.AZURE_OPENAI_DESIGN_DEPLOYMENT || "gpt-4.1").trim()
}

export function getAzureOpenAIForDesign(): AzureOpenAI {
  return getAzureOpenAIForDeployment(getDesignDeployment())
}

// -----------------------------
// Embeddings-specific helpers
// -----------------------------

export function getAzureOpenAIEmbeddingsDeployment(): string {
  return (
    process.env.AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT ||
    process.env.AZURE_OPENAI_DEPLOYMENT ||
    ""
  ).trim()
}

export function getAzureOpenAIEmbeddingsClient(): AzureOpenAI {
  const deployment = getAzureOpenAIEmbeddingsDeployment()
  if (!deployment) {
    throw new Error(
      "Azure embeddings deployment not configured. Set AZURE_OPENAI_EMBEDDINGS_DEPLOYMENT (recommended) or AZURE_OPENAI_DEPLOYMENT."
    )
  }

  // Allow using a separate Azure OpenAI resource for embeddings.
  const apiKey =
    process.env.AZURE_OPENAI_EMBEDDINGS_KEY ||
    process.env.AZURE_OPENAI_KEY ||
    process.env.AZURE_OPENAI_API_KEY

  if (!apiKey) {
    throw new Error(
      "Missing required env var: AZURE_OPENAI_KEY (or AZURE_OPENAI_API_KEY). Optionally AZURE_OPENAI_EMBEDDINGS_KEY."
    )
  }

  const endpoint =
    process.env.AZURE_OPENAI_EMBEDDINGS_ENDPOINT ||
    process.env.AZURE_OPENAI_ENDPOINT
  if (!endpoint)
    throw new Error("Missing required env var: AZURE_OPENAI_ENDPOINT")

  const apiVersion =
    process.env.AZURE_OPENAI_EMBEDDINGS_API_VERSION ||
    process.env.AZURE_OPENAI_API_VERSION
  if (!apiVersion)
    throw new Error("Missing required env var: AZURE_OPENAI_API_VERSION")

  // Use per-deployment cache so repeated calls don't allocate new clients
  const cacheKey = `embeddings:${endpoint}:${apiVersion}:${deployment}`
  const existing = _deploymentClients.get(cacheKey)
  if (existing) return existing

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment
  })

  _deploymentClients.set(cacheKey, client)
  return client
}
