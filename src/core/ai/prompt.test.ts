import { describe, expect, it } from 'vitest'
import { promptFor } from './prompts'

describe('AI prompts', () => {
  it('requires Chinese translation without pinyin or commentary', () => {
    const prompt = promptFor('translation', { text: 'A quiet page.', targetLanguage: '简体中文', mode: 'learning' })
    expect(prompt).toContain('Do not output Hanyu Pinyin')
    expect(prompt).toContain('Never add a heading, explanation')
    expect(prompt).toContain('{"translation":"..."}')
  })

  it('asks syntax analysis for verifiable UTF-16 offsets and exact text', () => {
    const prompt = promptFor('syntax', { sentence: 'Birds fly.', targetLanguage: '简体中文', language: 'en' })
    expect(prompt).toContain('JavaScript UTF-16 offsets')
    expect(prompt).toContain('"text":"exact substring"')
    expect(prompt).toContain('end is exclusive')
  })
})
