/**
 * TTS helpers shared by the speak route and unit tests.
 * The gateway accepts WAV (mp3 unsupported server-side) and caps input at
 * 1024 chars per request — we chunk on sentence boundaries and join the PCM
 * under a single header so playback is gapless.
 */

/** Split text into TTS-safe chunks (≤ maxLen chars) on sentence boundaries. */
export function chunkForTts(text: string, maxLen = 950): string[] {
  const sentences = text.match(/[^.!?。！？]+[.!?。！？]*\s*/g) ?? [text]
  const chunks: string[] = []
  let current = ''
  for (const sentence of sentences) {
    if ((current + sentence).length > maxLen && current) {
      chunks.push(current.trim())
      current = sentence
    } else {
      current += sentence
    }
  }
  if (current.trim()) chunks.push(current.trim())
  return chunks
}

/** Concatenate standard 44-byte-header PCM WAV buffers into one WAV. */
export function concatWav(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0)
  if (buffers.length === 1) return buffers[0]
  const header = Buffer.from(buffers[0].subarray(0, 44))
  const dataParts = buffers.map((b) => b.subarray(44))
  const dataLength = dataParts.reduce((n, p) => n + p.length, 0)
  const out = Buffer.concat([header, ...dataParts])
  out.writeUInt32LE(out.length - 8, 4)
  out.writeUInt32LE(dataLength, 40)
  return out
}

/** Validate that a buffer looks like a RIFF/WAVE file. */
export function isWav(buffer: Buffer): boolean {
  return buffer.length > 44 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WAVE'
}
