import { enSimple, enRules } from './en'
import { viSimple, viRules } from './vi'
import { defaultLanguage, type Language } from './language'

export interface TranslationRule {
  pattern: RegExp
  translation: string | ((parameters: Record<string, string>) => string)
}

const dictionaries: Partial<Record<Language, { simple: Record<string, string>, rules: readonly TranslationRule[] }>> = {
  en: { simple: enSimple, rules: enRules },
  vi: { simple: viSimple, rules: viRules },
}

export function translateText(source: string, language: Language): string {
  if (language === defaultLanguage) return source
  const dictionary = dictionaries[language]
  if (!dictionary) return source
  const key = source.trim()
  if (!key) return source
  let translated: string | undefined
  if (Object.hasOwn(dictionary.simple, key)) {
    translated = dictionary.simple[key]
  } else {
    for (const rule of dictionary.rules) {
      const match = rule.pattern.exec(key)
      if (!match) continue
      const parameters = match.groups || {}
      translated = typeof rule.translation === 'function'
        ? rule.translation(parameters)
        : rule.translation.replace(/\{(\w+)\}/g, (_placeholder, name: string) => parameters[name])
      break
    }
  }
  return translated === undefined ? source : source.replace(key, () => translated)
}
