/**
 * Content-addressed evidence store (FR-031): hash as filename, atomic
 * temp+rename writes, hash verified on read, natural dedup by address.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { EmmsError } from '../domain/errors.js';

export class EvidenceStore {
  constructor(private readonly artifactsDir: string) {}

  private pathFor(hash: string): string {
    return join(this.artifactsDir, hash.replace(/^sha256:/, '') + '.bin');
  }

  async store(content: Buffer): Promise<{ content_hash: string; byte_size: number }> {
    const content_hash = 'sha256:' + createHash('sha256').update(content).digest('hex');
    const finalPath = this.pathFor(content_hash);
    await mkdir(dirname(finalPath), { recursive: true });
    const tmp = finalPath + '.tmp-' + process.pid + '-' + Date.now();
    await writeFile(tmp, content);
    await rename(tmp, finalPath); // atomic; interrupted upload leaves no artifact
    return { content_hash, byte_size: content.length };
  }

  async read(content_hash: string): Promise<Buffer> {
    let buf: Buffer;
    try {
      buf = await readFile(this.pathFor(content_hash));
    } catch {
      throw new EmmsError('ARTIFACT_REJECTED', 'Artifact content not found', false, { content_hash });
    }
    const actual = 'sha256:' + createHash('sha256').update(buf).digest('hex');
    if (actual !== content_hash) {
      throw new EmmsError('ARTIFACT_HASH_MISMATCH', 'Artifact content no longer matches hash', false, {
        content_hash,
        actual,
      });
    }
    return buf;
  }
}
