/**
 * Vercel AI SDK provider factory.
 * Providers are constructed lazily — never at module load — based on env keys.
 */
import type { LanguageModel } from 'ai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createGoogleGenerativeAI } from '@ai-sdk/google'
import { createOpenAI } from '@ai-sdk/openai'

export type ProviderName = 'openai' | 'anthropic' | 'google'

export interface StreamChatOptions {
  model: LanguageModel
  prompt: string
  system?: string
}

function openai(): LanguageModel {
  return createOpenAI({ apiKey: process.env.OPENAI_API_KEY }).chat('gpt-4o-mini')
}

function anthropic(): LanguageModel {
  return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY }).languageModel('claude-3-5-haiku-latest')
}

function google(): LanguageModel {
  return createGoogleGenerativeAI({ apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY }).languageModel('gemini-2.0-flash')
}

export function getAvailableProviders(): Record<ProviderName, (() => LanguageModel) | null> {
  const has = (key: string | undefined): boolean => Boolean(key && key.length > 0)
  return {
    openai: has(process.env.OPENAI_API_KEY) ? openai : null,
    anthropic: has(process.env.ANTHROPIC_API_KEY) ? anthropic : null,
    google: has(process.env.GOOGLE_GENERATIVE_AI_API_KEY) ? google : null,
  }
}

export function resolveModel(preferred?: ProviderName): LanguageModel {
  const providers = getAvailableProviders()
  const order: ProviderName[] = preferred ? [preferred] : ['openai', 'anthropic', 'google']
  for (const name of order) {
    const factory = providers[name]
    if (factory) return factory()
  }
  throw new Error(
    'No LLM provider configured. Set OPENAI_API_KEY, ANTHROPIC_API_KEY, or GOOGLE_GENERATIVE_AI_API_KEY.',
  )
}
