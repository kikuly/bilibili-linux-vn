export type Language = 'zh-CN' | 'en' | 'vi'

// 原文语言，不需要翻译
export const defaultLanguage: Language = 'zh-CN'
// 用户从未选择过语言时使用的语言
export const firstRunLanguage: Language = 'vi'

export function normalizeLanguage(value: unknown): Language {
  if (typeof value === 'string') {
    if (/^en(?:[-_]|$)/i.test(value)) return 'en'
    if (/^vi(?:[-_]|$)/i.test(value)) return 'vi'
  }
  return defaultLanguage
}

export function languageDocument(): Document {
  try {
    return window.parent.document
  } catch {
    return document
  }
}
