/**
 * Q4 (spec amendment 001): init_session Rate-Limit — 20 Requests/min pro
 * Quell-IP (Default), 429-ähnliche Quota-Ablehnung. In-Memory, gleitendes
 * 60s-Fenster; prozesslokal (Single-Container-Betrieb).
 */
const WINDOW_MS = 60_000;

export class RateLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(private readonly maxPerMinute: number) {}

  /** Wirft bei Überschreitung; sonst wird der Hit registriert. */
  check(ip: string): void {
    const now = Date.now();
    const window = (this.hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS);
    if (window.length >= this.maxPerMinute) {
      this.hits.set(ip, window);
      const retryAfterSec = Math.ceil((WINDOW_MS - (now - window[0]!)) / 1000);
      throw new Error(`rate_limited: too many init_session requests; retry after ${retryAfterSec}s`);
    }
    window.push(now);
    this.hits.set(ip, window);
    // Gelegentliches Aufräumen verhindert ungebremstes Map-Wachstum.
    if (this.hits.size > 1000) {
      for (const [ipKey, times] of this.hits) {
        if (times.every((t) => now - t >= WINDOW_MS)) this.hits.delete(ipKey);
      }
    }
  }
}
