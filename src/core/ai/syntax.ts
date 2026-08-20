import type { SyntaxResult, SyntaxSpan } from '../document/types'

export type RawSyntaxSpan = SyntaxSpan & { text?: string }

function nearestOccurrence(sentence: string, text: string, expectedStart: number) {
  const starts: number[] = []
  let cursor = sentence.indexOf(text)
  while (cursor >= 0) {
    starts.push(cursor)
    cursor = sentence.indexOf(text, cursor + 1)
  }
  return starts.sort((a, b) => Math.abs(a - expectedStart) - Math.abs(b - expectedStart))[0]
}

export function normalizeSyntaxSpans(sentence: string, spans: RawSyntaxSpan[]): SyntaxSpan[] {
  const normalized = spans.flatMap((span) => {
    let start = span.start
    let end = span.end
    const quoted = span.text?.trim()

    if (quoted && sentence.slice(start, end) !== quoted) {
      if (sentence.slice(start, end + 1) === quoted) end += 1
      else {
        const found = nearestOccurrence(sentence, quoted, start)
        if (found === undefined) return []
        start = found
        end = found + quoted.length
      }
    }

    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end > sentence.length || start >= end) return []
    if (!sentence.slice(start, end).trim()) return []
    return [{ start, end, role: span.role, label: span.label, explanation: span.explanation }]
  })

  const unique = new Map<string, SyntaxSpan>()
  normalized.forEach((span) => unique.set(`${span.start}:${span.end}:${span.role}`, span))
  return [...unique.values()].sort((a, b) => a.start - b.start || a.end - b.end)
}

export function normalizeSyntaxResult(sentence: string, result: Omit<SyntaxResult, 'sentence' | 'spans'> & { spans: RawSyntaxSpan[] }): SyntaxResult {
  return { ...result, sentence, spans: normalizeSyntaxSpans(sentence, result.spans) }
}

export function isSyntaxTarget(target: { blockId: string; sentence: string } | null, blockId: string, sentence: string) {
  return target?.blockId === blockId && target.sentence === sentence.trim()
}
