export function translationOutcomeMessage(succeeded: number, failed: number, total: number, lastError: string) {
  if (failed === 0) return `全文翻译完成，共 ${succeeded} 段`
  if (succeeded === 0) return `翻译失败：${lastError}`
  return `已翻译 ${succeeded}/${total} 段，${failed} 段失败：${lastError}`
}
