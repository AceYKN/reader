export type LanguageCode = 'en' | 'ja' | 'mixed' | 'unknown'

export interface TextSegment {
  text: string
  marks?: {
    bold?: boolean
    italic?: boolean
    underline?: boolean
    link?: string
    code?: boolean
    formula?: 'latex' | 'mathml'
    displayFormula?: boolean
  }
}

export type DocumentBlock =
  | { id: string; type: 'paragraph' | 'heading' | 'quote'; level?: number; segments: TextSegment[]; language?: LanguageCode }
  | { id: string; type: 'list'; ordered: boolean; items: TextSegment[][]; language?: LanguageCode }
  | { id: string; type: 'code'; text: string; language?: LanguageCode }
  | { id: string; type: 'image'; src: string; alt?: string; caption?: string }
  | { id: string; type: 'formula'; source: 'mathml' | 'latex' | 'unknown'; content: string }
  | { id: string; type: 'table'; rows: string[][] }

export interface ReaderDocument {
  id: string
  meta: {
    title?: string
    author?: string
    sourceUrl?: string
    publicationDate?: string
    language?: LanguageCode
  }
  blocks: DocumentBlock[]
  createdAt: number
  updatedAt: number
}

export interface TranslationRecord {
  documentId: string
  blockId: string
  originalHash: string
  translation: string
  edited: boolean
}

export type SyntaxRole = 'subject' | 'predicate' | 'object' | 'complement' | 'adverbial' | 'modifier' | 'clause' | 'grammar'

export interface SyntaxSpan {
  start: number
  end: number
  role: SyntaxRole
  label: string
  explanation?: string
}

export interface SyntaxResult {
  sentence: string
  translation: string
  spans: SyntaxSpan[]
  grammar: Array<{ label: string; explanation: string }>
  difficulty: { cefr: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2'; confidence: number }
}

export interface DictionaryEntry {
  word: string
  phonetic?: string
  audio?: string
  partOfSpeech?: string
  definitions: string[]
  source: string
  chineseDefinitions?: string[]
  chineseSource?: string
  reading?: string
  romaji?: string
}

export interface ReaderPreferences {
  theme: 'light' | 'dark' | 'system'
  fontFamily: 'serif' | 'sans-serif' | 'system-ui'
  fontSize: number
  lineHeight: number
  contentWidth: number
  paragraphSpacing: number
  translationVisible: boolean
  layout: 'reading' | 'parallel'
  targetLanguage: string
  translationMode: 'faithful' | 'natural' | 'academic' | 'learning'
  localPersistence: boolean
}

export interface AISettings {
  provider: 'openai' | 'gemini' | 'anthropic' | 'openrouter' | 'deepseek'
  model: string
  apiKey: string
}
