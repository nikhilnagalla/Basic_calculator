import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { randomBytes } from 'node:crypto'

/** Write a file atomically (temp file + rename) so a crash never leaves half-written JSON. */
export async function writeFileAtomic(path: string, data: string | Buffer, mode = 0o600): Promise<void> {
  await fs.mkdir(dirname(path), { recursive: true })
  const tmp = `${path}.${randomBytes(4).toString('hex')}.tmp`
  await fs.writeFile(tmp, data, { mode })
  await fs.rename(tmp, path)
}

export async function readJson<T>(path: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8')) as T
  } catch {
    return undefined
  }
}
