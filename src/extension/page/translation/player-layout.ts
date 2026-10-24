import { defaultLanguage, type Language } from '../../common/translation/language'

// 播放器对非中文语言自带一套弹幕设置面板的单列布局（类名由播放器按语言切换），
// 这里按当前语言补上，译文变长后才不会挤在一起
const DANMAKU_SETTING_SELECTOR = '.bpx-player-dm-setting-wrap'
const DANMAKU_SETTING_I18N_CLASS = 'bpx-player-dm-setting-i18n-view'

export function createPlayerLayout(doc: Document, initialLanguage: Language = defaultLanguage) {
  let language = initialLanguage
  let scheduled = false

  function apply() {
    scheduled = false
    const enabled = language !== defaultLanguage
    doc.querySelectorAll(DANMAKU_SETTING_SELECTOR).forEach(element => {
      element.classList.toggle(DANMAKU_SETTING_I18N_CLASS, enabled)
    })
  }

  function schedule() {
    if (scheduled) return
    scheduled = true
    requestAnimationFrame(apply)
  }

  // 播放器是动态创建的，切换视频时还会重建
  const observer = new MutationObserver(schedule)
  observer.observe(doc.documentElement, { childList: true, subtree: true })
  schedule()

  return {
    setLanguage(nextLanguage: Language) {
      language = nextLanguage
      schedule()
    },
    dispose() {
      observer.disconnect()
      language = defaultLanguage
      apply()
    },
  }
}
