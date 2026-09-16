/**
 * Deterministic RNG utilities (seeded) so stochastic algorithms produce
 * reproducible, testable results. The internal state is a single uint32
 * (mulberry32), which makes it cheap to persist across tool calls
 * (e.g. multi-call bandit runs).
 */

export interface SeededRng {
  /** Next uniform sample in [0, 1). */
  next(): number;
  /** Snapshot of the internal state (persistable). */
  state(): number;
  /** Restore a previously snapshotted state. */
  setState(state: number): void;
}

/** mulberry32 — tiny, fast PRNG, adequate for simulations. */
export function createRng(seed: number): SeededRng {
  let a = seed >>> 0;
  return {
    next(): number {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
    state(): number {
      return a;
    },
    setState(next: number): void {
      a = next >>> 0;
    }
  };
}

/** Standard normal sample via Box–Muller (guards against log(0)). */
export function gaussian(rng: SeededRng, mu = 0, sigma = 1): number {
  const u = Math.max(rng.next(), Number.EPSILON);
  const v = rng.next();
  return mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** Uniform integer in [0, upperExclusive). */
export function sampleInteger(rng: SeededRng, upperExclusive: number): number {
  return Math.min(upperExclusive - 1, Math.floor(rng.next() * upperExclusive));
}

/** Uniform float in [lo, hi). */
export function sampleUniform(rng: SeededRng, lo: number, hi: number): number {
  return lo + (hi - lo) * rng.next();
}

/**
 * Gamma sample via Marsaglia–Tsang (d > 1) with boost for d <= 1.
 * Used by the Beta sampler for Thompson sampling on Bernoulli arms.
 */
export function sampleGamma(rng: SeededRng, d: number): number {
  if (d < 1) {
    return sampleGamma(rng, d + 1) * Math.pow(rng.next(), 1 / d);
  }
  const c = 1 / Math.sqrt(9 * d);
  for (;;) {
    const x = gaussian(rng);
    const v = Math.pow(1 + c * x, 3);
    if (v <= 0) continue;
    const u = rng.next();
    const lhs = u * u * u;
    if (lhs < 1 - 0.0331 * x * x * x * x) return d * v;
    if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
  }
}

/** Beta(a, b) sample via two normalized Gamma draws. */
export function sampleBeta(rng: SeededRng, alpha: number, beta: number): number {
  const x = sampleGamma(rng, alpha);
  const y = sampleGamma(rng, beta);
  const sum = x + y;
  return sum === 0 ? 0.5 : x / sum;
}
