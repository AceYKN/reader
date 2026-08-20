import type { LanguageCode } from '../document/types'

export function detectLanguage(text: string): LanguageCode {
  const meaningful = text.replace(/[\s\d\p{P}\p{S}]/gu, '')
  if (!meaningful) return 'unknown'
  const japanese = (meaningful.match(/[\u3040-\u30ff\u3400-\u9fff]/g) ?? []).length
  const kana = (meaningful.match(/[\u3040-\u30ff]/g) ?? []).length
  const latin = (meaningful.match(/[A-Za-z]/g) ?? []).length
  if (kana > 0 && latin > meaningful.length * 0.18) return 'mixed'
  if (kana > 0 || japanese > meaningful.length * 0.45) return 'ja'
  if (latin > meaningful.length * 0.55) return 'en'
  return 'unknown'
}

export function segmentSentences(text: string, language: LanguageCode): string[] {
  const locale = language === 'ja' ? 'ja' : 'en'
  if ('Segmenter' in Intl) {
    return [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)]
      .map(({ segment }) => segment)
      .filter((sentence) => sentence.trim())
  }
  return text.match(/[^.!?。！？]+[.!?。！？]?\s*/g)?.filter((sentence) => sentence.trim()) ?? [text]
}

export function classifySelection(text: string): 'word' | 'phrase' | 'sentence' | 'paragraph' {
  const trimmed = text.trim()
  if (!trimmed) return 'word'
  if (/[.!?。！？]\s*$/.test(trimmed) || trimmed.length > 100) return trimmed.includes('\n') ? 'paragraph' : 'sentence'
  const tokens = [...new Intl.Segmenter(detectLanguage(trimmed) === 'ja' ? 'ja' : 'en', { granularity: 'word' }).segment(trimmed)]
    .filter(({ isWordLike }) => isWordLike)
  return tokens.length <= 1 ? 'word' : tokens.length <= 8 ? 'phrase' : 'sentence'
}
