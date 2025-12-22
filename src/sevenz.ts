/**
 * High-Level 7z-Specific Decoders
 *
 * These functions accept properties separately (matching 7z format structure)
 * and internally wrap them with the data to use @napi-rs/lzma when available.
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

/**
 * Decode LZMA-compressed data from a 7z file
 *
 * @param data - LZMA compressed data (without properties)
 * @param properties - 5-byte LZMA properties (lc/lp/pb + dictionary size)
 * @param unpackSize - Expected output size
 * @returns Decompressed data
 */
export function decode7zLzma(data: Buffer, properties: Buffer, unpackSize: number): Buffer {
  // Try native acceleration first
  const native = tryLoadNative();
  if (native) {
    try {
      // @napi-rs/lzma expects properties embedded at the start of the data
      const selfDescribing = Buffer.concat([properties, data]);
      return native.lzma.decompressSync(selfDescribing);
    } catch {
      // Fall back to pure JS if native fails (e.g., format mismatch)
    }
  }

  // Pure JS fallback - use fast path directly (no sink wrapper for buffering)
  return decodeLzma(data, properties, unpackSize) as Buffer;
}

/**
 * Decode LZMA2-compressed data from a 7z file
 *
 * @param data - LZMA2 compressed data (without properties)
 * @param properties - 1-byte LZMA2 properties (dictionary size)
 * @param unpackSize - Expected output size (optional)
 * @returns Decompressed data
 */
export function decode7zLzma2(data: Buffer, properties: Buffer, unpackSize?: number): Buffer {
  // Try native acceleration first
  const native = tryLoadNative();
  if (native) {
    try {
      // @napi-rs/lzma expects properties embedded at the start of the data
      const selfDescribing = Buffer.concat([properties, data]);
      return native.lzma2.decompressSync(selfDescribing);
    } catch {
      // Fall back to pure JS if native fails (e.g., format mismatch)
    }
  }

  // Pure JS fallback - use fast path directly (no sink wrapper for buffering)
  return decodeLzma2(data, properties, unpackSize) as Buffer;
}
