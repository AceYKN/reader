import { describe, expect, it } from 'vitest'
import { classifySelection, detectLanguage, segmentSentences } from './detect'

describe('language detection', () => {
  it('detects ordinary English', () => expect(detectLanguage('Careful reading makes structure visible.')).toBe('en'))
  it('detects Japanese by kana', () => expect(detectLanguage('忙しいのに、彼は時間を作って来てくれた。')).toBe('ja'))
  it('detects mixed script', () => expect(detectLanguage('The word こんにちは means hello in Japanese.')).toBe('mixed'))
  it('returns unknown for punctuation only', () => expect(detectLanguage('...!?')).toBe('unknown'))
})

describe('segmentation and selection', () => {
  it('segments English sentences without losing punctuation', () => expect(segmentSentences('First sentence. Second sentence!', 'en')).toEqual(['First sentence. ', 'Second sentence!']))
  it('classifies phrases separately from sentences', () => {
    expect(classifySelection('with a view to')).toBe('phrase')
    expect(classifySelection('This is a complete sentence.')).toBe('sentence')
  })
})
