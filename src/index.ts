/**
 * XZ-Compat: XZ/LZMA Decompression Library
 *
 * Pure JavaScript implementation with optional native acceleration
 * via lzma-native on Node.js 10+.
 *
 * Works on Node.js 0.8+ with automatic performance optimization
 * when native bindings are available.
 */

// ============================================================================
// High-Level APIs (Recommended)
// ============================================================================

// 7z-specific decoders - accept properties separately, try native automatically
export { decode7zLzma, decode7zLzma2, type SevenZDecodeCallback } from './sevenz.ts';
// XZ container format - self-describing, works great with native acceleration
export { createXZDecoder, decodeXZ, type XzDecodeCallback } from './xz/Decoder.ts';

// ============================================================================
// Low-Level APIs (Backward Compatibility)
// ============================================================================

// Raw LZMA decoders (for specialized use cases)
export { createLzma2Decoder, createLzmaDecoder, decodeLzma, decodeLzma2 } from './lzma/index.ts';

// ============================================================================
// Supporting APIs
// ============================================================================

// Preprocessing filters (BCJ/Delta - used by 7z-iterator)
export * from './filters/index.ts';

// Native acceleration utilities
export { isNativeAvailable } from './native.ts';

// Callback type used by async decoders
export type { DecodeCallback } from './utils/runDecode.ts';
