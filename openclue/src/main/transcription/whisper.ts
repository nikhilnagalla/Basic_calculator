// Whisper speech-to-text backends:
//  - whisper.cpp CLI   (fully local; `brew install whisper-cpp` provides `whisper-cli`)
//  - whisper.cpp server (fully local; `whisper-server -m model.bin --port 8178`)
//  - OpenAI-compatible /audio/transcriptions (OpenAI, Groq, speaches / faster-whisper-server, ...)
import { app } from 'electron'
import { execFile } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { constants as fsConstants, promises as fs } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { delimiter, isAbsolute, join } from 'node:path'
import type { Settings, TranscribeResult } from '@shared/types'
import { describeHttpError } from '../llm/format'
import { cleanTranscript } from './clean'

const MAX_WAV_BYTES = 25 * 1024 * 1024

// GUI apps on macOS do not inherit the shell PATH, so look in the usual Homebrew locations too.
const EXTRA_PATHS = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', join(homedir(), '.local', 'bin')]

async function isExecutable(p: string): Promise<boolean> {
  try {
    await fs.access(p, fsConstants.X_OK)
    return true
  } catch {
    return false
  }
}

async function resolveBinary(name: string): Promise<string | null> {
  const expanded = name.startsWith('~') ? join(homedir(), name.slice(1)) : name
  if (isAbsolute(expanded)) return (await isExecutable(expanded)) ? expanded : null
  const dirs = [...(process.env.PATH ?? '').split(delimiter), ...EXTRA_PATHS].filter(Boolean)
  const candidates = expanded === 'whisper-cli' ? ['whisper-cli', 'whisper-cpp', 'main'] : [expanded]
  for (const c of candidates) {
    for (const d of dirs) {
      const full = join(d, c)
      if (await isExecutable(full)) return full
    }
  }
  return null
}

async function resolveModel(configured: string): Promise<string | null> {
  if (configured.trim()) {
    const p = configured.startsWith('~') ? join(homedir(), configured.slice(1)) : configured
    try {
      await fs.access(p)
      return p
    } catch {
      return null
    }
  }
  // Auto-discover a ggml model in the app's models folder.
  const modelsDir = join(app.getPath('userData'), 'models')
  try {
    const files = (await fs.readdir(modelsDir)).filter((f) => /^ggml-.*\.bin$/.test(f)).sort()
    const preferred = files.find((f) => f.includes('base')) ?? files[0]
    return preferred ? join(modelsDir, preferred) : null
  } catch {
    return null
  }
}

function run(bin: string, args: string[], timeoutMs: number): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(bin, args, { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) reject(new Error(`${err.message}${stderr ? `\n${String(stderr).slice(-400)}` : ''}`))
      else resolve(String(stdout))
    })
  })
}

async function transcribeWithCli(wav: Buffer, t: Settings['transcription']): Promise<string> {
  const bin = await resolveBinary(t.whisperCliPath || 'whisper-cli')
  if (!bin) {
    throw new Error(
      `whisper.cpp CLI not found ("${t.whisperCliPath}"). Install it with \`brew install whisper-cpp\` or set the path in Settings → Transcription.`
    )
  }
  const model = await resolveModel(t.whisperModelPath)
  if (!model) {
    throw new Error(
      `No Whisper model found. Download one (e.g. ggml-base.en.bin) and set its path in Settings → Transcription, or place it in ${join(app.getPath('userData'), 'models')}.`
    )
  }
  const file = join(tmpdir(), `openclue-${randomBytes(6).toString('hex')}.wav`)
  await fs.writeFile(file, wav, { mode: 0o600 })
  try {
    const args = ['-m', model, '-f', file, '-nt', '-np', '-l', t.language || 'auto']
    return await run(bin, args, 60_000)
  } finally {
    // Audio is never kept on disk after transcription.
    await fs.rm(file, { force: true })
  }
}

function wavForm(wav: Buffer, extra: Record<string, string>): FormData {
  const form = new FormData()
  form.append('file', new Blob([new Uint8Array(wav)], { type: 'audio/wav' }), 'audio.wav')
  for (const [k, v] of Object.entries(extra)) if (v) form.append(k, v)
  return form
}

async function postForm(url: string, form: FormData, headers: Record<string, string> = {}): Promise<string> {
  let res: Response
  try {
    res = await fetch(url, { method: 'POST', body: form, headers, signal: AbortSignal.timeout(60_000) })
  } catch (err) {
    const cause = err instanceof Error ? ((err.cause as Error | undefined)?.message ?? err.message) : String(err)
    throw new Error(`Couldn't reach transcription server at ${url} (${cause}).`)
  }
  const body = await res.text()
  if (!res.ok) throw new Error(describeHttpError(res.status, body))
  try {
    const json = JSON.parse(body) as { text?: string }
    return json.text ?? ''
  } catch {
    return body
  }
}

export async function transcribe(wav: Buffer, settings: Settings, apiKey?: string): Promise<TranscribeResult> {
  if (!Buffer.isBuffer(wav) || wav.length < 44 || wav.length > MAX_WAV_BYTES) throw new Error('Invalid audio chunk')
  if (wav.toString('ascii', 0, 4) !== 'RIFF' || wav.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Audio must be WAV')
  const t = settings.transcription
  let raw: string
  switch (t.backend) {
    case 'whisper-cpp-cli':
      raw = await transcribeWithCli(wav, t)
      break
    case 'whisper-cpp-server':
      raw = await postForm(
        `${t.whisperServerUrl}/inference`,
        wavForm(wav, { response_format: 'json', temperature: '0', language: t.language })
      )
      break
    case 'openai-compatible':
      if (!apiKey && !/^https?:\/\/(localhost|127\.0\.0\.1)/.test(t.openaiBaseUrl)) {
        throw new Error('No API key set for the transcription provider. Add one in Settings → Transcription.')
      }
      raw = await postForm(
        `${t.openaiBaseUrl}/audio/transcriptions`,
        wavForm(wav, { model: t.openaiModel, language: t.language === 'auto' ? '' : t.language, response_format: 'json' }),
        apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
      )
      break
  }
  return { text: cleanTranscript(raw) }
}

/** One second of silence, used by the "Test" button in settings to verify the backend is wired up. */
export function silentWav(seconds = 1, sampleRate = 16000): Buffer {
  const samples = seconds * sampleRate
  const buf = Buffer.alloc(44 + samples * 2)
  buf.write('RIFF', 0, 'ascii')
  buf.writeUInt32LE(36 + samples * 2, 4)
  buf.write('WAVE', 8, 'ascii')
  buf.write('fmt ', 12, 'ascii')
  buf.writeUInt32LE(16, 16)
  buf.writeUInt16LE(1, 20)
  buf.writeUInt16LE(1, 22)
  buf.writeUInt32LE(sampleRate, 24)
  buf.writeUInt32LE(sampleRate * 2, 28)
  buf.writeUInt16LE(2, 32)
  buf.writeUInt16LE(16, 34)
  buf.write('data', 36, 'ascii')
  buf.writeUInt32LE(samples * 2, 40)
  return buf
}
