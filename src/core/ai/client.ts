import { z } from 'zod'
import type { AISettings, SyntaxResult } from '../document/types'
import { normalizeSyntaxResult } from './syntax'

const syntaxSchema = z.object({
  sentence: z.string(),
  translation: z.string(),
  spans: z.array(z.object({
    start: z.number().int().nonnegative(),
    end: z.number().int().positive(),
    role: z.enum(['subject', 'predicate', 'object', 'complement', 'adverbial', 'modifier', 'clause', 'grammar']),
    label: z.string(),
    explanation: z.string().optional(),
    text: z.string().optional(),
  })),
  grammar: z.array(z.object({ label: z.string(), explanation: z.string() })).default([]),
  difficulty: z.object({ cefr: z.enum(['A1', 'A2', 'B1', 'B2', 'C1', 'C2']), confidence: z.number().min(0).max(1) }),
})

const defaults: Record<AISettings['provider'], string> = {
  openai: 'gpt-5-mini',
  gemini: 'gemini-3.5-flash-lite',
  anthropic: 'claude-sonnet-4-5',
  openrouter: 'openai/gpt-5-mini',
  deepseek: 'deepseek-v4-flash',
}

export function defaultModel(provider: AISettings['provider']) { return defaults[provider] }

async function requestAI(settings: AISettings, operation: 'translation' | 'syntax', payload: Record<string, unknown>, signal?: AbortSignal) {
  const key = settings.apiKey.trim()
  const usesPublicDeepSeek = settings.provider === 'deepseek' && !key
  if (!key && !usesPublicDeepSeek) throw new Error('请先在设置中填写自己的 AI API Key。')
  const response = await fetch('/api/ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(key ? { 'X-Provider-Key': key } : {}) },
    body: JSON.stringify({ provider: settings.provider, model: settings.model || defaults[settings.provider], operation, payload }),
    signal,
  })
  const result = await response.json().catch(() => null) as { result?: unknown; message?: string } | null
  if (!response.ok) throw new Error(result?.message ?? `AI 服务暂时不可用（${response.status}）`)
  return result?.result
}

const romanizationOnly = /^[\s()[\]A-Za-zÀ-žĀ-ž'’.,;:!?-]+$/

export function normalizeTranslationText(value: string, targetLanguage: string) {
  const withoutLabel = value.trim().replace(/^(?:翻译|译文|translation)\s*[:：]\s*/i, '')
  const lines = withoutLabel.split(/\n+/).map((line) => line.trim()).filter(Boolean)
  const containsChinese = lines.some((line) => /[\u3400-\u9fff]/.test(line))
  const cleaned = containsChinese ? lines.filter((line) => !romanizationOnly.test(line)) : lines
  const translation = cleaned.join('\n').trim()
  if (!translation) throw new Error('AI 没有返回可用译文，请重试。')
  if (/(?:中文|Chinese|简体|繁体|繁體)/i.test(targetLanguage) && !/[\u3400-\u9fff]/.test(translation)) {
    throw new Error('AI 没有返回中文译文，请重试或更换模型。')
  }
  return translation
}

export async function translateParagraph(text: string, targetLanguage: string, mode: string, settings: AISettings, context?: string, signal?: AbortSignal) {
  const result = await requestAI(settings, 'translation', { text, targetLanguage, mode, context }, signal)
  const parsed = z.object({ translation: z.string().min(1) }).safeParse(result)
  if (!parsed.success) throw new Error('翻译结果格式异常，请重新尝试。')
  return normalizeTranslationText(parsed.data.translation, targetLanguage)
}

export async function analyzeSyntax(sentence: string, language: string, targetLanguage: string, settings: AISettings, signal?: AbortSignal): Promise<SyntaxResult> {
  const result = await requestAI(settings, 'syntax', { sentence, language, targetLanguage }, signal)
  const parsed = syntaxSchema.safeParse(result)
  if (!parsed.success) throw new Error('句法分析结果格式异常，请重新尝试。')
  return normalizeSyntaxResult(sentence, parsed.data)
}

export function loadAISettings(): AISettings {
  try {
    const saved = JSON.parse(sessionStorage.getItem('margin-reader:ai') ?? '{}') as Partial<AISettings>
    const provider = saved.provider && saved.provider in defaults ? saved.provider : 'deepseek'
    const retiredGeminiDefault = provider === 'gemini' && ['gemini-2.5-flash', 'gemini-2.5-flash-lite'].includes(saved.model ?? '')
    const retiredDeepSeekDefault = provider === 'deepseek' && ['deepseek-chat', 'deepseek-reasoner'].includes(saved.model ?? '')
    return { provider, model: retiredGeminiDefault || retiredDeepSeekDefault ? defaults[provider] : saved.model || defaults[provider], apiKey: saved.apiKey || '' }
  } catch { return { provider: 'deepseek', model: defaults.deepseek, apiKey: '' } }
}

export function saveAISettings(settings: AISettings) {
  sessionStorage.setItem('margin-reader:ai', JSON.stringify(settings))
}
