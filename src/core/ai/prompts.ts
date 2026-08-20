export type AIOperation = 'translation' | 'syntax'

export function promptFor(operation: AIOperation, payload: Record<string, unknown>) {
  if (operation === 'translation') {
    const modes: Record<string, string> = {
      faithful: 'Be maximally faithful and add nothing.',
      natural: 'Write natural, fluent target-language prose.',
      academic: 'Preserve terminology and formal academic register.',
      learning: 'Make the original logic and structure visible for a language learner.',
    }
    const target = String(payload.targetLanguage).slice(0, 40)
    return [
      `You are a professional literary and academic translator. Translate the source into ${target}.`,
      modes[String(payload.mode)] ?? modes.faithful,
      'Translate every meaningful part, including headings and sentence fragments. Preserve names, numbers, logical relations, tone, and paragraph structure.',
      'The translation value must contain only the final translated text. Never add a heading, explanation, Markdown fence, pronunciation, pinyin, romaji, transliteration, alternatives, or the original text.',
      /(?:中文|Chinese|简体|繁体|繁體)/i.test(target) ? 'Write idiomatic Chinese characters. Do not output Hanyu Pinyin or any Latin-letter pronunciation guide.' : '',
      `Previous context is for disambiguation only; do not translate or repeat it: ${String(payload.context ?? '').slice(0, 600)}`,
      'Return valid JSON exactly matching: {"translation":"..."}',
      `SOURCE TEXT:\n${String(payload.text).slice(0, 12000)}`,
    ].filter(Boolean).join('\n\n')
  }
  return [
    `Analyze this ${String(payload.language).slice(0, 10)} sentence for a Chinese-speaking language learner.`,
    'Return valid JSON only. Keep sentence exactly identical to the input. Use JavaScript UTF-16 offsets: start is inclusive and end is exclusive.',
    'For every span, copy the exact covered substring into text so offsets can be verified. Prefer useful, non-empty components; nested spans are allowed. Do not invent text.',
    'Allowed roles: subject, predicate, object, complement, adverbial, modifier, clause, grammar. Write labels and explanations in clear Simplified Chinese.',
    `Translate into ${String(payload.targetLanguage).slice(0, 40)} using Chinese characters only, without pinyin or pronunciation notes. Add concise grammar notes and estimate CEFR with confidence from 0 to 1.`,
    'Schema: {"sentence":"exact input","translation":"...","spans":[{"start":0,"end":1,"text":"exact substring","role":"subject","label":"主语","explanation":"..."}],"grammar":[{"label":"...","explanation":"..."}],"difficulty":{"cefr":"B2","confidence":0.75}}',
    `INPUT:\n${String(payload.sentence).slice(0, 3000)}`,
  ].join('\n\n')
}
