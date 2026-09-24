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
    const hex = hash.replace(/^sha256:/, '');
    // CB-11: caller-supplied hashes must be plain sha256 hex before they reach
    // join() — rejects traversal strings and malformed hashes early.
    if (!/^[a-f0-9]{64}$/.test(hex)) {
      throw new EmmsError('ARTIFACT_REJECTED', 'Malformed artifact hash', false, { content_hash: hash });
    }
    return join(this.artifactsDir, hex + '.bin');
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
    // CB-11: resolve/validate FIRST — a malformed hash must surface as its own
    // error, not be swallowed by the read-miss catch below.
    const p = this.pathFor(content_hash);
    let buf: Buffer;
    try {
      buf = await readFile(p);
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
