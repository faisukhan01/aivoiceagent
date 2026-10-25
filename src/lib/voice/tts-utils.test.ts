import { describe, expect, it } from 'vitest'

import { chunkForTts, concatWav, isWav } from '@/lib/voice/tts-utils'

describe('chunkForTts', () => {
  it('keeps short text as a single chunk', () => {
    expect(chunkForTts('Hello there.')).toEqual(['Hello there.'])
  })

  it('splits on sentence boundaries under the size cap', () => {
    const long = Array.from({ length: 40 }, (_, i) => `Sentence number ${i} with some words.`).join(' ')
    const chunks = chunkForTts(long, 200)
    expect(chunks.length).toBeGreaterThan(1)
    for (const c of chunks) expect(c.length).toBeLessThanOrEqual(220)
    expect(chunks.join(' ')).toContain('Sentence number 39')
  })

  it('never drops content', () => {
    const text = 'Alpha beta gamma. Delta epsilon zeta! Eta theta iota? Kappa.'
    const joined = chunkForTts(text, 30).join(' ')
    for (const word of ['Alpha', 'Delta', 'Eta', 'Kappa']) expect(joined).toContain(word)
  })

  it('handles CJK sentence enders', () => {
    const chunks = chunkForTts('你好世界。这是第二个句子！', 10)
    expect(chunks.length).toBeGreaterThanOrEqual(2)
  })

  it('returns [] for empty input', () => {
    expect(chunkForTts('   ')).toEqual([])
  })
})

describe('concatWav', () => {
  function makeWav(pcmBytes: number, seed: number): Buffer {
    const buf = Buffer.alloc(44 + pcmBytes)
    buf.write('RIFF', 0, 'ascii')
    buf.writeUInt32LE(36 + pcmBytes, 4)
    buf.write('WAVE', 8, 'ascii')
    buf.write('fmt ', 12, 'ascii')
    buf.writeUInt32LE(16, 16)
    buf.writeUInt16LE(1, 20) // PCM
    buf.writeUInt16LE(1, 22) // mono
    buf.writeUInt32LE(24000, 24)
    buf.writeUInt32LE(48000, 28)
    buf.writeUInt16LE(2, 32)
    buf.writeUInt16LE(16, 34)
    buf.write('data', 36, 'ascii')
    buf.writeUInt32LE(pcmBytes, 40)
    for (let i = 0; i < pcmBytes; i++) buf[44 + i] = (seed + i) % 256
    return buf
  }

  it('passes through a single buffer untouched', () => {
    const wav = makeWav(100, 1)
    expect(concatWav([wav]).equals(wav)).toBe(true)
  })

  it('joins multiple buffers under one valid header', () => {
    const a = makeWav(100, 1)
    const b = makeWav(50, 200)
    const out = concatWav([a, b])
    expect(isWav(out)).toBe(true)
    expect(out.length).toBe(44 + 150)
    expect(out.readUInt32LE(40)).toBe(150) // data chunk size patched
    expect(out.readUInt32LE(4)).toBe(out.length - 8) // RIFF size patched
    // PCM of the second buffer preserved
    expect(out[44 + 100]).toBe(b[44])
  })

  it('returns empty buffer for empty input', () => {
    expect(concatWav([]).length).toBe(0)
  })
})
