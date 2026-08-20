import { describe, expect, it } from 'vitest'
import { isSyntaxTarget, normalizeSyntaxSpans } from './syntax'

describe('syntax span normalization', () => {
  it('repairs wrong offsets from the exact quoted substring', () => {
    const spans = normalizeSyntaxSpans('The quiet page rests.', [{ start: 1, end: 4, text: 'quiet page', role: 'subject', label: '主语' }])
    expect(spans[0]).toMatchObject({ start: 4, end: 14, role: 'subject' })
  })

  it('repairs providers that return an inclusive end offset', () => {
    const spans = normalizeSyntaxSpans('Birds fly.', [{ start: 0, end: 4, text: 'Birds', role: 'subject', label: '主语' }])
    expect(spans[0]).toMatchObject({ start: 0, end: 5 })
  })

  it('drops invalid and duplicate spans while preserving UTF-16 offsets', () => {
    const spans = normalizeSyntaxSpans('I 😊 code.', [
      { start: 2, end: 4, text: '😊', role: 'object', label: '宾语' },
      { start: 2, end: 4, text: '😊', role: 'object', label: '宾语' },
      { start: 99, end: 120, text: 'missing', role: 'grammar', label: '错误' },
    ])
    expect(spans).toHaveLength(1)
    expect(spans[0]).toMatchObject({ start: 2, end: 4 })
  })
})

describe('syntax target identity', () => {
  it('uses both block id and sentence so repeated sentences do not cross-highlight', () => {
    const target = { blockId: 'block-a', sentence: 'It matters.' }
    expect(isSyntaxTarget(target, 'block-a', 'It matters.')).toBe(true)
    expect(isSyntaxTarget(target, 'block-b', 'It matters.')).toBe(false)
  })
})
