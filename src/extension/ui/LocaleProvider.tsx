import type { PropsWithChildren } from 'react'
import { ConfigProvider, theme } from 'antd'
import enUS from 'antd/locale/en_US'
import viVN from 'antd/locale/vi_VN'
import zhCN from 'antd/locale/zh_CN'
import { useSelector } from 'react-redux'
import type { RootState } from './store'

function getPopupContainer() {
  let container = document.getElementById('bili-extension-popups')
  if (!container) {
    container = document.createElement('div')
    container.id = 'bili-extension-popups'
    container.dataset.biliI18nSkip = ''
    document.body.appendChild(container)
  }
  return container
}

const antdLocales = { 'zh-CN': zhCN, en: enUS, vi: viVN }
// 越南语需要带完整变音符号的字体，与 index.scss 中的 $vi-font-family 保持一致
const viFontFamily = "'Segoe UI', 'Helvetica Neue', Roboto, 'Noto Sans', 'DejaVu Sans', 'Liberation Sans', Arial, 'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC', 'WenQuanYi Micro Hei', sans-serif"

export default function LocaleProvider({ children }: PropsWithChildren) {
  const language = useSelector((state: RootState) => state.storage.lang)
  return (
    <ConfigProvider
      locale={antdLocales[language]}
      theme={{
        algorithm: theme.darkAlgorithm,
        token: language === 'vi' ? { fontFamily: viFontFamily } : undefined,
      }}
      getPopupContainer={getPopupContainer}
      modal={{ className: 'bili-extension-ui' }}
      notification={{ className: 'bili-extension-ui' }}
    >
      {children}
    </ConfigProvider>
  )
}
