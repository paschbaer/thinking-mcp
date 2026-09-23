/**
 * AsyncLocalStorage-Brücke: der Bearer-Token des HTTP-Requests muss in den
 * sessiongebundenen Tool-Handlern für FR-103.1 verfügbar sein.
 */
import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<{ bearerToken: string }>();

export function runWithBearerToken<T>(token: string, fn: () => T): T {
  return storage.run({ bearerToken: token }, fn);
}

export function getBearerToken(): string {
  return storage.getStore()?.bearerToken ?? "";
}
