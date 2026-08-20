export async function hashText(text: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return [...new Uint8Array(bytes)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export function blockText(block: import('./types').DocumentBlock) {
  if ('segments' in block) return block.segments.map((segment) => segment.text).join('')
  if (block.type === 'list') return block.items.map((item) => item.map((segment) => segment.text).join('')).join('\n')
  if (block.type === 'code') return block.text
  if (block.type === 'table') return block.rows.flat().join(' ')
  if (block.type === 'formula') return block.content
  return block.alt ?? ''
}
