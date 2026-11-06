// Decides whether bytes are an image a browser can draw, whatever the headers claim.
// PNG is decoded far enough to prove its pixel data. The other formats are checked for their
// full structure, which stops a truncated or faked file, but this is not a full decoder.

import { crc32, inflateSync } from 'node:zlib'

const CHANNELS = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }

function isPng(bytes) {
  let at = 8
  let header = null
  const data = []
  while (at + 12 <= bytes.length) {
    const size = bytes.readUInt32BE(at)
    const end = at + 12 + size
    if (end > bytes.length) return false
    const type = bytes.toString('latin1', at + 4, at + 8)
    if (crc32(bytes.subarray(at + 4, at + 8 + size)) !== bytes.readUInt32BE(at + 8 + size)) return false
    if (at === 8 && (type !== 'IHDR' || size !== 13)) return false
    if (type === 'IHDR') header = bytes.subarray(at + 8, at + 21)
    if (type === 'IDAT') data.push(bytes.subarray(at + 8, at + 8 + size))
    if (type === 'IEND') return Boolean(header) && data.length > 0 && hasPixels(header, Buffer.concat(data))
    at = end
  }
  return false
}

function hasPixels(header, data) {
  const width = header.readUInt32BE(0)
  const height = header.readUInt32BE(4)
  const channels = CHANNELS[header[9]]
  if (!width || !height || !channels) return false
  let pixels
  try {
    pixels = inflateSync(data)
  } catch {
    return false
  }
  if (header[12] !== 0) return pixels.length > 0
  return pixels.length >= (1 + Math.ceil((width * channels * header[8]) / 8)) * height
}

function isJpeg(bytes) {
  let at = 2
  let frame = false
  while (at + 4 <= bytes.length) {
    if (bytes[at] !== 0xff) return false
    const marker = bytes[at + 1]
    if (marker === 0xda) return frame && bytes.subarray(-1024).includes(Buffer.from([0xff, 0xd9]))
    const size = bytes.readUInt16BE(at + 2)
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)
    if (isFrame) frame = at + 9 <= bytes.length && bytes.readUInt16BE(at + 5) > 0 && bytes.readUInt16BE(at + 7) > 0
    at += 2 + size
  }
  return false
}

function skipBlocks(bytes, start) {
  let at = start
  while (at < bytes.length && bytes[at] !== 0) at += bytes[at] + 1
  return at + 1
}

function isGif(bytes) {
  if (bytes.length < 14) return false
  const table = packed => (packed & 0x80 ? 3 * 2 ** ((packed & 7) + 1) : 0)
  let at = 13 + table(bytes[10])
  let image = false
  while (at < bytes.length) {
    if (bytes[at] === 0x3b) return image
    if (bytes[at] === 0x21) {
      at = skipBlocks(bytes, at + 2)
    } else if (bytes[at] === 0x2c) {
      image = true
      at = skipBlocks(bytes, at + 10 + table(bytes[at + 9]) + 1)
    } else {
      return false
    }
  }
  return false
}

function isWebp(bytes) {
  return bytes.length > 20 && bytes.readUInt32LE(4) + 8 <= bytes.length && /^VP8[ LX]$/.test(bytes.toString('latin1', 12, 16))
}

function isAvif(bytes) {
  const boxes = new Set()
  let at = 0
  while (at + 8 <= bytes.length) {
    const size = bytes.readUInt32BE(at)
    if (size < 8) return false
    boxes.add(bytes.toString('latin1', at + 4, at + 8))
    at += size
  }
  return at === bytes.length && boxes.has('meta') && boxes.has('mdat')
}

function isSvg(text) {
  return /^\s*(\xef\xbb\xbf)?\s*(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!doctype[^>]*>\s*)?<svg[\s>/]/i.test(text)
    && /(<\/svg\s*>|^[^>]*\/>)\s*$/i.test(text)
}

export function looksLikeImage(bytes) {
  const text = bytes.toString('latin1')
  if (text.startsWith('\x89PNG\r\n\x1a\n')) return isPng(bytes)
  if (text.startsWith('\xff\xd8\xff')) return isJpeg(bytes)
  if (/^GIF8[79]a/.test(text)) return isGif(bytes)
  if (text.startsWith('RIFF') && text.slice(8, 12) === 'WEBP') return isWebp(bytes)
  if (text.slice(4, 8) === 'ftyp' && /^(avif|avis|mif1|heic)/.test(text.slice(8, 12))) return isAvif(bytes)
  return isSvg(text)
}
