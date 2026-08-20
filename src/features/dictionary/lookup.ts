import { toRomaji } from 'wanakana'
import type { DictionaryEntry } from '../../core/document/types'
import { detectLanguage } from '../../core/language/detect'
import { cacheDictionary } from '../../core/storage/db'

export async function lookupWord(word: string): Promise<DictionaryEntry[]> {
  const normalized = word.trim().replace(/^[\p{P}\p{S}]+|[\p{P}\p{S}]+$/gu, '')
  if (!normalized) return []
  const language = detectLanguage(normalized)
  if (language === 'ja') {
    return [{ word: normalized, reading: normalized, romaji: toRomaji(normalized), definitions: ['本地 JMdict 词库将在后续数据包中提供；可先使用句法分析获取当前语境含义。'], source: '日语本地辅助' }]
  }
  const key = `en-zh:v3:${normalized.toLowerCase()}`
  const cached = await cacheDictionary(key)
  if (cached) return cached as DictionaryEntry[]
  const response = await fetch(`/api/dictionary/en-zh?word=${encodeURIComponent(normalized)}`)
  if (!response.ok) return []
  const entries = await response.json() as DictionaryEntry[]
  await cacheDictionary(key, entries)
  return entries
}

export function speak(text: string, language = 'en', rate = 0.9) {
  speechSynthesis.cancel()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = language === 'ja' ? 'ja-JP' : 'en-US'
  utterance.rate = rate
  const voice = speechSynthesis.getVoices().find((candidate) => candidate.lang.toLowerCase().startsWith(language === 'ja' ? 'ja' : 'en'))
  if (voice) utterance.voice = voice
  speechSynthesis.speak(utterance)
}
