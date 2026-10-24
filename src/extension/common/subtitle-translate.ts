import { createLogger } from "../../common/log";
const log = createLogger('SubtitleTranslate')

// translate.googleapis.com/translate_a/single 容易被 429，这个接口支持多个 q 且按顺序返回
const GOOGLE_TRANSLATE_URL = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=auto'
const BATCH_SIZE = 100
const CONCURRENCY = 4
// 缓存保留30天
const CACHE_TTL = 30 * 24 * 60 * 60 * 1000

interface SubtitleItem {
  content: string
  from: number
  to: number
}
interface SubtitleJson {
  body?: SubtitleItem[]
}
interface CacheEntry {
  key: string
  text: string
  time: number
}

/**
 * 调用Google翻译，结果与输入一一对应
 */
const googleTranslate = async (texts: string[], target: string): Promise<string[]> => {
  const body = new URLSearchParams()
  for (const text of texts) body.append('q', text)
  const res = await fetch(`${GOOGLE_TRANSLATE_URL}&tl=${target}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  })
  if (res.status !== 200) throw new Error(`Google翻译失败: ${res.status}`)
  // sl=auto时返回 [[译文, 源语言], ...]，单个q时可能直接返回字符串
  const data: unknown = await res.json()
  const list = Array.isArray(data) ? data : [data]
  const result = list.map(e => Array.isArray(e) ? e[0] : e)
  if (result.length !== texts.length || result.some(e => typeof e !== 'string'))
    throw new Error('Google翻译结果数量不匹配')
  return result as string[]
}

const translateTexts = async (texts: string[], target: string): Promise<string[]> => {
  const batches: string[][] = []
  for (let i = 0; i < texts.length; i += BATCH_SIZE) batches.push(texts.slice(i, i + BATCH_SIZE))
  const results: string[][] = new Array(batches.length)
  let next = 0
  const worker = async () => {
    while (next < batches.length) {
      const idx = next++
      results[idx] = await googleTranslate(batches[idx], target)
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker))
  return results.flat()
}

class TranslateCache {
  private db: Promise<IDBDatabase> | null = null

  private open() {
    if (!this.db) {
      this.db = new Promise((resolve, reject) => {
        const request = indexedDB.open('SubtitleTranslate', 1)
        request.onerror = reject
        request.onsuccess = () => resolve(request.result)
        request.onupgradeneeded = () => {
          request.result.createObjectStore('cache', { keyPath: 'key' })
        }
      })
      this.db.catch(() => this.db = null)
    }
    return this.db
  }

  async get(key: string): Promise<string | undefined> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction('cache', 'readonly').objectStore('cache').get(key)
      request.onerror = reject
      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined
        resolve(entry && Date.now() - entry.time < CACHE_TTL ? entry.text : undefined)
      }
    })
  }

  async put(key: string, text: string) {
    const db = await this.open()
    const entry: CacheEntry = { key, text, time: Date.now() }
    db.transaction('cache', 'readwrite').objectStore('cache').put(entry)
  }
}

const cache = new TranslateCache()
// 同一请求的 onload/onloadend 会各触发一次，第二次拿到的已是译文，所以本次会话内复用结果
const pending = new Map<string, Promise<string>>()

const doTranslate = async (cacheKey: string, subtitleText: string, target: string) => {
  try {
    const cached = await cache.get(cacheKey)
    if (cached) return cached
  } catch (err) {
    log.error('读取翻译缓存失败:', err)
  }
  const subtitle: SubtitleJson = JSON.parse(subtitleText)
  const body = subtitle.body || []
  const translated = await translateTexts(body.map(e => e.content), target)
  body.forEach((item, i) => item.content = translated[i])
  const result = JSON.stringify(subtitle)
  cache.put(cacheKey, result).catch(err => log.error('写入翻译缓存失败:', err))
  return result
}

/**
 * 翻译B站字幕JSON（只翻译content），结果按 cacheKey 缓存
 * @param cacheKey 字幕地址（不含参数）
 * @param subtitleText 原始字幕JSON
 * @param target 目标语言，如 vi
 */
export const translateSubtitle = (cacheKey: string, subtitleText: string, target: string): Promise<string> => {
  const key = `${target}:${cacheKey}`
  let task = pending.get(key)
  if (!task) {
    task = doTranslate(key, subtitleText, target)
    task.catch(() => pending.delete(key))
    pending.set(key, task)
  }
  return task
}
