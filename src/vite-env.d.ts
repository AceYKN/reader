/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module '@mozilla/readability' {
  export class Readability {
    constructor(document: Document)
    parse(): { title: string; byline: string | null; content: string; textContent: string } | null
  }
}

declare module 'mammoth/mammoth.browser' {
  export function convertToHtml(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string; messages: unknown[] }>
}
