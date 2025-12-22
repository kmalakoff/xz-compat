// XZ and LZMA decoders for external use

// Re-export filters for convenience
export * from './filters/index.ts';
export type { OutputSink } from './lzma/index.ts';
export {
  createLzma2Decoder,
  createLzmaDecoder,
  decodeLzma,
  decodeLzma2,
  detectLzmaFormat,
  Lzma2Decoder,
  LzmaDecoder,
} from './lzma/index.ts';
export { createXZDecoder, decodeXZ } from './xz/Decoder.ts';
