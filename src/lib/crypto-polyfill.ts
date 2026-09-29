/**
 * Polyfill for crypto.randomUUID — missing on older mobile WebViews
 * (Android WebView < 92, iOS Safari < 15.4, non-secure HTTP contexts).
 *
 * Must be imported at the top of the root layout / app entry point,
 * BEFORE any library or hook calls crypto.randomUUID().
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

(function polyfillCryptoRandomUUID() {
  if (typeof globalThis === "undefined") return;

  const c = (globalThis as any).crypto ?? (globalThis as any).msCrypto;

  if (c && typeof c.randomUUID !== "function") {
    c.randomUUID = function randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
      // RFC 4122 v4 UUID via getRandomValues (universally available when crypto exists)
      const bytes = new Uint8Array(16);
      c.getRandomValues(bytes);
      bytes[6] = (bytes[6] & 0x0f) | 0x40; // version 4
      bytes[8] = (bytes[8] & 0x3f) | 0x80; // variant 1
      const hex = Array.from(bytes, (b: number) => b.toString(16).padStart(2, "0")).join("");
      return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` as `${string}-${string}-${string}-${string}-${string}`;
    };
  }

  // If crypto itself is missing (extremely rare — only non-HTTPS or very old Node)
  if (!c) {
    (globalThis as any).crypto = {
      randomUUID(): `${string}-${string}-${string}-${string}-${string}` {
        return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (ch) => {
          const r = (Math.random() * 16) | 0;
          return (ch === "x" ? r : (r & 0x3) | 0x8).toString(16);
        }) as `${string}-${string}-${string}-${string}-${string}`;
      },
      getRandomValues<T extends ArrayBufferView>(array: T): T {
        const bytes = array as unknown as Uint8Array;
        for (let i = 0; i < bytes.length; i++) {
          bytes[i] = (Math.random() * 256) | 0;
        }
        return array;
      },
    };
  }
})();

export {};
