import { AzureOpenAI } from "openai"

let _defaultClient: AzureOpenAI | null = null
const _deploymentClients = new Map<string, AzureOpenAI>()

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

  _defaultClient = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment
  })

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

  const client = new AzureOpenAI({
    apiKey,
    endpoint,
    apiVersion,
    deployment: key
  })

  _deploymentClients.set(key, client)
  return client
}
