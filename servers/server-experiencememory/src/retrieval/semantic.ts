/**
 * Semantic retrieval arm (spec FR-014, research.md): local embedding via
 * transformers.js (Xenova/all-MiniLM-L6-v2, quantized ONNX, 384 dims).
 * Lazy model load; graceful unavailability -> search reports semantic as
 * unavailable instead of failing (spec Clarifications: behind same interface).
 */

export interface EmbeddingProvider {
  /** Whether the provider can produce embeddings (model loadable). */
  available(): Promise<boolean>;
  /** Embed text; returns null when unavailable. */
  embed(text: string): Promise<Float32Array | null>;
}

export class TransformersEmbedding implements EmbeddingProvider {
  private pipeline: import('@xenova/transformers').FeatureExtractionPipeline | null = null;
  private loadAttempted = false;
  private loadFailed = false;

  async available(): Promise<boolean> {
    if (this.loadFailed) return false;
    if (this.pipeline) return true;
    // Probe without caching a failure permanently: try loading once.
    return (await this.embed('probe')) !== null;
  }

  async embed(text: string): Promise<Float32Array | null> {
    if (this.loadFailed) return null;
    if (!this.loadAttempted) {
      this.loadAttempted = true;
      try {
        const mod = await import('@xenova/transformers');
        this.pipeline = await mod.pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', { quantized: true });
      } catch {
        this.loadFailed = true;
        return null;
      }
    }
    if (!this.pipeline) return null;
    try {
      const out = await this.pipeline(text, { pooling: 'mean', normalize: true });
      return out.data as Float32Array;
    } catch {
      return null;
    }
  }
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) dot += a[i] * b[i];
  return dot;
}
