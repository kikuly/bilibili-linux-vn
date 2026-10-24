import { languageDocument, normalizeLanguage } from '../common/translation/language'
import { createDomTranslator } from './translation/dom-translator'
import { createPlayerLayout } from './translation/player-layout'

let dispose: (() => void) | undefined

export function initTranslation() {
  if (dispose) return dispose
  const translator = createDomTranslator(document)
  const playerLayout = createPlayerLayout(document)
  const target = languageDocument()
  const onLanguageChange = (event: Event) => {
    const language = normalizeLanguage((event as CustomEvent<unknown>).detail)
    translator.setLanguage(language)
    playerLayout.setLanguage(language)
  }
  target.addEventListener('changeLanguage', onLanguageChange)
  dispose = () => {
    target.removeEventListener('changeLanguage', onLanguageChange)
    window.removeEventListener('pagehide', onPageHide)
    translator.dispose()
    playerLayout.dispose()
    dispose = undefined
  }
  const onPageHide = (event: PageTransitionEvent) => {
    if (!event.persisted) dispose?.()
  }
  window.addEventListener('pagehide', onPageHide)
  return dispose
}
