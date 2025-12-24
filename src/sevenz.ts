/**
 * High-Level 7z-Specific Decoders
 *
 * These functions accept properties separately (matching 7z format structure)
 * and execute either the native lzma-native path or the pure JS fallback.
 *
 * This provides automatic native acceleration for 7z files while maintaining
 * the API that 7z-iterator expects.
 *
 * IMPORTANT: Buffer Management Pattern
 *
 * ❌ SLOW - DO NOT use OutputSink with buffering:
 *   const chunks: Buffer[] = [];
 *   decodeLzma2(data, props, size, { write: c => chunks.push(c) });
 *   return Buffer.concat(chunks);  // ← 3 copies: push + concat + return
 *
 *   OutWindow → chunks.push(chunk) → Buffer.concat(chunks) → result
 *              COPY TO ARRAY              COPY ALL            FINAL BUFFER
 *
 * ✅ FAST - Direct return (let decoder manage buffer):
 *   return decodeLzma2(data, props, size) as Buffer;  // ← 1 copy
 *
 *   OutWindow → pre-allocated buffer → result
 *               DIRECT WRITE
 *
 * The decodeLzma2() function internally pre-allocates the exact output size
 * and writes directly to it. Wrapping with an OutputSink that buffers to an
 * array defeats this optimization by creating unnecessary intermediate copies.
 */

import { decodeLzma2 } from './lzma/sync/Lzma2Decoder.ts';
import { decodeLzma } from './lzma/sync/LzmaDecoder.ts';
import { tryLoadNative } from './native.ts';
import { type DecodeCallback, runDecode, runSync } from './utils/runDecode.ts';

/** Callback invoked when an async 7z decode completes */
export type SevenZDecodeCallback = DecodeCallback<Buffer>;

export function decode7zLzma(data: Buffer, properties: Buffer, unpackSize: number, callback: SevenZDecodeCallback): void;
export function decode7zLzma(data: Buffer, properties: Buffer, unpackSize: number): Promise<Buffer>;
/**
 * Decode LZMA-compressed data from a 7z file
 */
export function decode7zLzma(data: Buffer, properties: Buffer, unpackSize: number, callback?: SevenZDecodeCallback): Promise<Buffer> | void {
  return runDecode((done) => {
    const fallback = () => runSync(() => decodeLzma(data, properties, unpackSize) as Buffer, done);
    const native = tryLoadNative();

    if (native && native.lzma) {
      try {
        const promise = native.lzma(data, properties, unpackSize);
        if (promise && typeof promise.then === 'function') {
          promise.then(
            (value) => done(null, value),
            () => fallback()
          );
          return;
        }
      } catch {
        // fall through to fallback
      }
    }

    fallback();
  }, callback);
}

/**
 * Decode LZMA2-compressed data from a 7z file
 */
export function decode7zLzma2(data: Buffer, properties: Buffer, unpackSize: number | undefined, callback: SevenZDecodeCallback): void;
export function decode7zLzma2(data: Buffer, properties: Buffer, unpackSize?: number): Promise<Buffer>;
export function decode7zLzma2(data: Buffer, properties: Buffer, unpackSize?: number, callback?: SevenZDecodeCallback): Promise<Buffer> | void {
  return runDecode((done) => {
    const fallback = () => runSync(() => decodeLzma2(data, properties, unpackSize) as Buffer, done);
    const native = tryLoadNative();

    if (native && native.lzma2) {
      try {
        const promise = native.lzma2(data, properties, unpackSize);
        if (promise && typeof promise.then === 'function') {
          promise.then(
            (value) => done(null, value),
            () => fallback()
          );
          return;
        }
      } catch {
        // fall through to fallback
      }
    }

    fallback();
  }, callback);
}
