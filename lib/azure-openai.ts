import { AzureOpenAI } from "openai"

let _client: AzureOpenAI | null = null

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
  if (_client) return _client

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

  _client = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment
  })

  return _client
}

export function getAzureOpenAIModel(): string {
  return requireEnv("AZURE_OPENAI_DEPLOYMENT")
}
