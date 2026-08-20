import { describe, expect, it } from 'vitest'
import { defaultModel, normalizeTranslationText } from './client'
import { translationOutcomeMessage } from './translation-outcome'

describe('AI provider defaults', () => {
  it('uses the currently supported Gemini free-tier model', () => {
    expect(defaultModel('gemini')).toBe('gemini-3.5-flash-lite')
  })

  it('supports the official DeepSeek chat model', () => {
    expect(defaultModel('deepseek')).toBe('deepseek-v4-flash')
  })

  it('removes a separate pinyin line from Chinese translation output', () => {
    expect(normalizeTranslationText('译文：安静的一页。\nĀn jìng de yí yè.', '简体中文')).toBe('安静的一页。')
  })

  it('rejects romanization-only output when Chinese was requested', () => {
    expect(() => normalizeTranslationText('An jing de yi ye.', '简体中文')).toThrow('没有返回中文译文')
  })
})

describe('translation outcome messages', () => {
  it('does not report success when every paragraph failed', () => {
    expect(translationOutcomeMessage(0, 3, 3, 'API key rejected')).toBe('翻译失败：API key rejected')
  })

  it('reports partial results accurately', () => {
    expect(translationOutcomeMessage(2, 1, 3, 'rate limited')).toBe('已翻译 2/3 段，1 段失败：rate limited')
  })
})
