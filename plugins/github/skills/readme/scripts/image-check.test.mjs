import assert from 'node:assert/strict'
import { test } from 'node:test'
import { crc32 } from 'node:zlib'

import { looksLikeImage } from './image-check.mjs'

const base64 = text => Buffer.from(text, 'base64')
const PNG = base64('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=')
const GIF = base64('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7')
const WEBP = base64('UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>ok</text></svg>\n')

function chunk(type, data = Buffer.alloc(0)) {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const size = Buffer.alloc(4)
  size.writeUInt32BE(data.length)
  const sum = Buffer.alloc(4)
  sum.writeUInt32BE(crc32(body))
  return Buffer.concat([size, body, sum])
}

const SIGNATURE = PNG.subarray(0, 8)
const IHDR = chunk('IHDR', PNG.subarray(16, 29))
const jpeg = (...parts) => Buffer.from([0xff, 0xd8, ...parts.flat()])
const FRAME = [0xff, 0xc0, 0, 11, 8, 0, 1, 0, 1, 1, 1, 0x11, 0]
const SCAN = [0xff, 0xda, 0, 8, 1, 1, 0, 0, 63, 0, 1, 2]
const END = [0xff, 0xd9]

for (const [name, bytes] of [
  ['a PNG', PNG],
  ['a GIF', GIF],
  ['a WEBP', WEBP],
  ['an SVG', SVG],
  ['a JPEG', jpeg(FRAME, SCAN, END)],
  ['a self-closed SVG', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" />')],
]) {
  test(`accepts ${name}`, () => assert.equal(looksLikeImage(bytes), true))
}

for (const [name, bytes] of [
  ['the PNG signature alone', SIGNATURE],
  ['a PNG cut short', PNG.subarray(0, 40)],
  ['a PNG with the words IDAT and IEND but no chunks', Buffer.concat([SIGNATURE, IHDR, Buffer.from('IDATIEND')])],
  ['a PNG with an empty IDAT', Buffer.concat([SIGNATURE, IHDR, chunk('IDAT'), chunk('IEND')])],
  ['a PNG whose IDAT is not compressed data', Buffer.concat([SIGNATURE, IHDR, chunk('IDAT', Buffer.from('not zlib')), chunk('IEND')])],
  ['a PNG with too few pixels', Buffer.concat([SIGNATURE, chunk('IHDR', Buffer.from([0, 0, 1, 0, 0, 0, 1, 0, 8, 6, 0, 0, 0])), PNG.subarray(41)])],
  ['a PNG with a bad checksum', Buffer.concat([PNG.subarray(0, 29), Buffer.alloc(4), PNG.subarray(33)])],
  ['a JPEG with no frame', jpeg(SCAN, END)],
  ['a JPEG with no end', jpeg(FRAME, SCAN)],
  ['a GIF with no image', Buffer.concat([GIF.subarray(0, 13), Buffer.alloc(6), Buffer.from([0x3b])])],
  ['a GIF cut short', GIF.subarray(0, 20)],
  ['a WEBP cut short', WEBP.subarray(0, 18)],
  ['an SVG cut short', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><text>cut')],
  ['plain text', Buffer.from('not an image')],
]) {
  test(`refuses ${name}`, () => assert.equal(looksLikeImage(bytes), false))
}
