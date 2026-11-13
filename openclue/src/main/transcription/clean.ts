// Post-processing for Whisper output. Pure + unit-tested.

// Whisper emits these for silence / non-speech audio.
const NOISE_PATTERNS = [
  /\[(?:blank_audio|silence|music|noise|inaudible|no speech|sound|applause|laughter)[^\]]*\]/gi,
  /\((?:music|silence|noise|inaudible|applause|laughter|static|wind)[^)]*\)/gi,
  /\[\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}\s*-->\s*(?:\d{1,2}:)?\d{2}:\d{2}[.,]\d{1,3}\s*\]/g
]

/** Common hallucinations Whisper produces on near-silent audio. Only dropped when they are the whole chunk. */
const SILENCE_HALLUCINATIONS = new Set([
  'you', 'thank you.', 'thank you', 'thanks for watching!', 'thanks for watching.', 'bye.', '.', '...'
])

export function cleanTranscript(raw: string): string {
  let text = raw
  for (const re of NOISE_PATTERNS) text = text.replace(re, ' ')
  text = text.replace(/\s+/g, ' ').trim()
  if (SILENCE_HALLUCINATIONS.has(text.toLowerCase())) return ''
  return text
}
