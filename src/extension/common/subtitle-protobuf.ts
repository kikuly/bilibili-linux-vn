/**
 * 播放器通过 //api.bilibili.com/x/v2/subtitle/web/view 以 protobuf 获取字幕列表，这里只实现往列表里追加字幕轨所需的最小编解码。
 *
 * 结构（只列用到的字段）:
 *   响应 { 1: 字幕视图 { 3: 字幕轨[] { 1: id(varint), 2: id_str, 3: lan, 4: lan_doc, 5: subtitle_url, 8: lan_doc_brief, 其它字段原样保留 } } }
 */

interface Field {
  no: number
  /** 去掉标签和长度前缀后的内容，仅长度分隔类型有值 */
  payload?: Uint8Array
  /** 含标签的完整字段字节 */
  raw: Uint8Array
  wire: number
}

export interface SubtitleTrackInfo {
  lan: string
  url: string
}

export interface NewSubtitleTrack {
  id: number
  lan: string
  lanDoc: string
  /** 作为模板的已有字幕轨下标 */
  source: number
}

export interface AddedSubtitleTrack {
  lan: string
  url: string
}

const encoder = new TextEncoder()
const decoder = new TextDecoder()

function readVarint(buf: Uint8Array, pos: number): [number, number] {
  let result = 0
  let shift = 0
  for (;;) {
    if (pos >= buf.length) throw new Error('protobuf: unexpected end')
    const byte = buf[pos++]
    result += (byte & 0x7f) * 2 ** shift
    if (!(byte & 0x80)) return [result, pos]
    shift += 7
  }
}

function encodeVarint(value: number | bigint): Uint8Array {
  let v = BigInt(value)
  const out: number[] = []
  while (v > 0x7fn) {
    out.push(Number(v & 0x7fn) | 0x80)
    v >>= 7n
  }
  out.push(Number(v))
  return Uint8Array.from(out)
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, p) => sum + p.length, 0))
  let offset = 0
  for (const part of parts) {
    out.set(part, offset)
    offset += part.length
  }
  return out
}

function parseFields(buf: Uint8Array): Field[] {
  const fields: Field[] = []
  let pos = 0
  while (pos < buf.length) {
    const start = pos
    let tag: number
    ;[tag, pos] = readVarint(buf, pos)
    const no = Math.floor(tag / 8)
    const wire = tag & 7
    let payload: Uint8Array | undefined
    if (wire === 0) {
      ;[, pos] = readVarint(buf, pos)
    } else if (wire === 1) {
      pos += 8
    } else if (wire === 5) {
      pos += 4
    } else if (wire === 2) {
      let length: number
      ;[length, pos] = readVarint(buf, pos)
      payload = buf.subarray(pos, pos + length)
      pos += length
    } else {
      throw new Error(`protobuf: unsupported wire type ${wire}`)
    }
    if (pos > buf.length) throw new Error('protobuf: unexpected end')
    fields.push({ no, wire, raw: buf.subarray(start, pos), payload })
  }
  return fields
}

function lengthDelimited(no: number, payload: Uint8Array): Uint8Array {
  return concat([encodeVarint(no * 8 + 2), encodeVarint(payload.length), payload])
}

const stringField = (no: number, value: string) => lengthDelimited(no, encoder.encode(value))
const varintField = (no: number, value: number) => concat([encodeVarint(no * 8), encodeVarint(value)])

const readString = (fields: Field[], no: number) => {
  const field = fields.find(e => e.no === no && e.payload)
  return field ? decoder.decode(field.payload) : ''
}

/**
 * 往字幕列表追加字幕轨，已有字幕轨原样保留
 * @param buffer 原响应
 * @param plan 根据已有字幕轨决定追加哪些，返回空数组则不改动
 * @returns 新响应和追加的字幕轨（subtitle_url 带 translate 参数）；无法解析或无需追加时返回 null
 */
export function addSubtitleTracks(
  buffer: ArrayBuffer,
  plan: (tracks: SubtitleTrackInfo[]) => NewSubtitleTrack[],
): { buffer: ArrayBuffer; added: AddedSubtitleTrack[] } | null {
  const outer = parseFields(new Uint8Array(buffer))
  const view = outer.find(e => e.no === 1 && e.payload)
  if (!view?.payload) return null
  const inner = parseFields(view.payload)
  const items = inner.filter(e => e.no === 3 && e.payload).map(e => parseFields(e.payload!))
  const tracks = plan(items.map(fields => ({ lan: readString(fields, 3), url: readString(fields, 5) })))
  if (tracks.length === 0) return null

  const added: AddedSubtitleTrack[] = []
  const newItems = tracks.map(track => {
    const source = items[track.source]
    const sourceUrl = readString(source, 5)
    const url = `${sourceUrl}${sourceUrl.includes('?') ? '&' : '?'}translate=${track.lan}`
    added.push({ lan: track.lan, url })
    const fields = source.map(field => {
      switch (field.no) {
        case 1: return varintField(1, track.id)
        case 2: return stringField(2, `${track.id}`)
        case 3: return stringField(3, track.lan)
        case 4: return stringField(4, track.lanDoc)
        case 5: return stringField(5, url)
        case 8: return stringField(8, track.lanDoc)
        default: return field.raw
      }
    })
    return lengthDelimited(3, concat(fields))
  })
  const newView = lengthDelimited(1, concat([view.payload, ...newItems]))
  const result = concat(outer.map(field => (field === view ? newView : field.raw)))
  return { buffer: result.buffer.slice(result.byteOffset, result.byteOffset + result.byteLength) as ArrayBuffer, added }
}
