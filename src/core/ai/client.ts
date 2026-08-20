import { z } from 'zod'
import type { AISettings, SyntaxResult } from '../document/types'

const syntaxSchema = z.object({
  sentence: z.string(),
  translation: z.string(),
  spans: z.array(z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    role: z.enum(['subject', 'predicate', 'object', 'complement', 'adverbial', 'modifier', 'clause', 'grammar']),
    label: z.string(),
    explanation: z.string().optional(),
  })),
  grammar: z.array(z.object({ label: z.string(), explanation: z.string() })).default([]),
  difficulty: z.object({ cefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']), confidence: z.number().min(0).max(1) }),
})

const defaults: Record<AISettings['provider'], string> = {
  openai: 'gpt-5-mini',
  gemini: 'gemini-2.5-flash',
  anthropic: 'claude-sonnet-4-5',
  openrouter: 'openai/gpt-5-mini',
}

export function defaultModel(provider: AISettings['provider']) { return defaults[provider] }

async function requestAI(settings: AISettings, operation: 'translation' | 'syntax', payload: Record<string, unknown>, signal?: AbortSignal) {
  if (!settings.apiKey.trim()) throw new Error('请先在设置中填写自己的 AI API Key。')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Provider-Key': settings.apiKey.trim() },
    body: JSON.stringify({ provider: settings.provider, model: settings.model || defaults[settings.provider], operation, payload }),
    signal,
  })
  const result = await response.json().catch(() => null) as { result?: unknown; message?: string } | null
  if (!response.ok) throw new Error(result?.message ?? `AI 服务暂时不可用（${response.status}）`)
  return result?.result
}

export async function translateParagraph(text: string, targetLanguage: string, mode: string, settings: AISettings, context?: string, signal?: AbortSignal) {
  const result = await requestAI(settings, 'translation', { text, targetLanguage, mode, context }, signal)
  const parsed = z.object({ translation: z.string().min(1) }).safeParse(result)
  if (!parsed.success) throw new Error('翻译结果格式异常，请重新尝试。')
  return parsed.data.translation
}

export async function analyzeSyntax(sentence: string, language: string, targetLanguage: string, settings: AISettings, signal?: AbortSignal): Promise<SyntaxResult> {
  const result = await requestAI(settings, 'syntax', { sentence, language, targetLanguage }, signal)
  const parsed = syntaxSchema.safeParse(result)
  if (!parsed.success) throw new Error('句法分析结果格式异常，请重新尝试。')
  const validSpans = parsed.data.spans.filter((span) => span.end <= sentence.length && span.start < span.end)
  return { ...parsed.data, sentence, spans: validSpans }
}

export function loadAISettings(): AISettings {
  try {
    const saved = JSON.parse(sessionStorage.getItem('margin-reader:ai') ?? '{}') as Partial<AISettings>
    const provider = saved.provider && saved.provider in defaults ? saved.provider : 'openai'
    return { provider, model: saved.model || defaults[provider], apiKey: saved.apiKey || '' }
  } catch { return { provider: 'openai', model: defaults.openai, apiKey: '' } }
}

export function saveAISettings(settings: AISettings) {
  sessionStorage.setItem('margin-reader:ai', JSON.stringify(settings))
}
