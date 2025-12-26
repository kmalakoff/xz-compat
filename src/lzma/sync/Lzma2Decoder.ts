/**
 * Synchronous LZMA2 Decoder
 *
 * LZMA2 is a container format that wraps LZMA chunks with framing.
 * Decodes LZMA2 data from a buffer or BufferList.
 */

import { allocBufferUnsafe, type BufferLike, bufferConcat, bufferFrom, canAllocateBufferSize } from 'extract-base-iterator';
import { parseLzma2ChunkHeader } from '../lib/Lzma2ChunkParser.ts';
import { type OutputSink, parseLzma2DictionarySize } from '../types.ts';
import { LzmaDecoder } from './LzmaDecoder.ts';

/**
 * Read multiple bytes from BufferLike into a Buffer
 */
function readBytes(input: BufferLike, offset: number, length: number): Buffer {
  if (Buffer.isBuffer(input)) {
    return input.slice(offset, offset + length);
  }
  // For BufferList, create a new Buffer with the data
  const buf = bufferFrom(new Array(length));
  for (let i = 0; i < length; i++) {
    buf[i] = input.readByte(offset + i);
  }
  return buf;
}

/**
 * Synchronous LZMA2 decoder
 */
export class Lzma2Decoder {
  private lzmaDecoder: LzmaDecoder;
  private dictionarySize: number;

  constructor(properties: Buffer | Uint8Array, outputSink?: OutputSink) {
    if (!properties || properties.length < 1) {
      throw new Error('LZMA2 requires properties byte');
    }

    this.dictionarySize = parseLzma2DictionarySize(properties[0]);
    this.lzmaDecoder = new LzmaDecoder(outputSink);
    this.lzmaDecoder.setDictionarySize(this.dictionarySize);
  }

  /**
   * Reset the dictionary (for stream boundaries)
   */
  resetDictionary(): void {
    this.lzmaDecoder.resetDictionary();
  }

  /**
   * Reset all probability models (for stream boundaries)
   */
  resetProbabilities(): void {
    this.lzmaDecoder.resetProbabilities();
  }

  /**
   * Set LZMA properties
   */
  setLcLpPb(lc: number, lp: number, pb: number): boolean {
    return this.lzmaDecoder.setLcLpPb(lc, lp, pb);
  }

  /**
   * Feed uncompressed data to the dictionary (for subsequent LZMA chunks)
   */
  feedUncompressed(data: Buffer): void {
    this.lzmaDecoder.feedUncompressed(data);
  }

  /**
   * Decode raw LZMA data (used internally for LZMA2 chunks)
   * @param input - LZMA compressed data
   * @param offset - Input offset
   * @param outSize - Expected output size
   * @param solid - Use solid mode
   * @returns Decompressed data
   */
  decodeLzmaData(input: Buffer, offset: number, outSize: number, solid = false): Buffer {
    return this.lzmaDecoder.decode(input, offset, outSize, solid);
  }

  /**
   * Decode LZMA2 data with streaming output
   * @param input - LZMA2 compressed data (Buffer or BufferList)
   * @returns Total number of bytes written to sink
   */
  decodeWithSink(input: BufferLike): number {
    let totalBytes = 0;
    let offset = 0;

    while (true) {
      const result = parseLzma2ChunkHeader(input, offset);

      if (!result.success) {
        throw new Error('Truncated LZMA2 chunk header');
      }

      const chunk = result.chunk;

      if (chunk.type === 'end') {
        break;
      }

      // Handle dictionary reset
      if (chunk.dictReset) {
        this.lzmaDecoder.resetDictionary();
      }

      // Handle state reset
      if (chunk.stateReset) {
        this.lzmaDecoder.resetProbabilities();
      }

      // Apply new properties if present
      if (chunk.newProps) {
        const { lc, lp, pb } = chunk.newProps;
        this.lzmaDecoder.setLcLpPb(lc, lp, pb);
      }

      const dataOffset = offset + chunk.headerSize;
      const useSolid = !chunk.stateReset || (chunk.stateReset && !chunk.dictReset);

      if (chunk.type === 'uncompressed') {
        // Read uncompressed data directly
        const uncompData = readBytes(input, dataOffset, chunk.uncompSize);

        // Feed uncompressed data to dictionary so subsequent LZMA chunks can reference it
        this.lzmaDecoder.feedUncompressed(uncompData);

        totalBytes += uncompData.length;
        offset = dataOffset + chunk.uncompSize;
      } else {
        // LZMA compressed chunk - decode directly from BufferLike
        totalBytes += this.lzmaDecoder.decodeWithSink(input, dataOffset, chunk.uncompSize, useSolid);

        offset = dataOffset + chunk.compSize;
      }
    }

    // Flush any remaining data in the OutWindow
    this.lzmaDecoder.flushOutWindow();

    return totalBytes;
  }

  /**
   * Decode LZMA2 data
   * @param input - LZMA2 compressed data (Buffer or BufferList)
   * @param unpackSize - Expected output size (optional, for pre-allocation)
   * @returns Decompressed data
   */
  decode(input: BufferLike, unpackSize?: number): Buffer {
    // Pre-allocate output buffer if size is known and safe for this Node version
    let outputBuffer: Buffer | null = null;
    let outputPos = 0;
    const outputChunks: Buffer[] = [];

    // Use canAllocateBufferSize to dynamically check if pre-allocation is safe
    const canPreAllocate = unpackSize && unpackSize > 0 && canAllocateBufferSize(unpackSize);
    if (canPreAllocate) {
      outputBuffer = allocBufferUnsafe(unpackSize);
    }

    let offset = 0;

    // Parse and decode LZMA2 chunks one at a time
    while (true) {
      const result = parseLzma2ChunkHeader(input, offset);

      if (!result.success) {
        throw new Error('Truncated LZMA2 chunk header');
      }

      const chunk = result.chunk;

      if (chunk.type === 'end') {
        break;
      }

      const dataOffset = offset + chunk.headerSize;

      // Handle dictionary reset
      if (chunk.dictReset) {
        this.lzmaDecoder.resetDictionary();
      }

      // Handle state reset
      if (chunk.stateReset) {
        this.lzmaDecoder.resetProbabilities();
      }

      // Apply new properties if present
      if (chunk.newProps) {
        const { lc, lp, pb } = chunk.newProps;
        this.lzmaDecoder.setLcLpPb(lc, lp, pb);
      }

      // Determine solid mode
      const useSolid = !chunk.stateReset || (chunk.stateReset && !chunk.dictReset);

      if (chunk.type === 'uncompressed') {
        // Read uncompressed data
        const uncompData = readBytes(input, dataOffset, chunk.uncompSize);

        // Copy to output
        if (outputBuffer) {
          uncompData.copy(outputBuffer, outputPos);
          outputPos += uncompData.length;
        } else {
          outputChunks.push(uncompData);
        }

        // Feed uncompressed data to dictionary so subsequent LZMA chunks can reference it
        this.lzmaDecoder.feedUncompressed(uncompData);

        offset = dataOffset + chunk.uncompSize;
      } else {
        // LZMA compressed chunk - decode directly from BufferLike
        if (outputBuffer) {
          // Zero-copy: decode directly into caller's buffer
          const bytesWritten = this.lzmaDecoder.decodeToBuffer(input, dataOffset, chunk.uncompSize, outputBuffer, outputPos, useSolid);
          outputPos += bytesWritten;
        } else {
          // No pre-allocation: decode to new buffer and collect chunks
          const chunkData = readBytes(input, dataOffset, chunk.compSize);
          const decoded = this.lzmaDecoder.decode(chunkData, 0, chunk.uncompSize, useSolid);
          outputChunks.push(decoded);
        }

        offset = dataOffset + chunk.compSize;
      }
    }

    // Return pre-allocated buffer or concatenated chunks
    if (outputBuffer) {
      return outputPos < outputBuffer.length ? outputBuffer.slice(0, outputPos) : outputBuffer;
    }
    // Use bufferConcat which handles large buffers safely via pairwise combination
    return bufferConcat(outputChunks);
  }
}

/**
 * Decode LZMA2 data synchronously
 * @param input - LZMA2 compressed data (Buffer or BufferList)
 * @param properties - 1-byte properties (dictionary size)
 * @param unpackSize - Expected output size (optional, autodetects if not provided)
 * @param outputSink - Optional output sink with write callback for streaming (returns bytes written)
 * @returns Decompressed data (or bytes written if outputSink provided)
 */
export function decodeLzma2(input: BufferLike, properties: Buffer | Uint8Array, unpackSize?: number, outputSink?: { write(buffer: Buffer): void }): Buffer | number {
  // For very large outputs on old Node versions, we cannot return a single Buffer
  // Use streaming mode internally to handle large outputs on modern Node
  if (!outputSink && unpackSize && unpackSize > 0 && !canAllocateBufferSize(unpackSize)) {
    // Large output - use streaming mode with internal chunking
    const chunks: Buffer[] = [];
    const sink: OutputSink = {
      write(buffer: Buffer): void {
        chunks.push(buffer);
      },
    };

    const decoder = new Lzma2Decoder(properties, sink);
    decoder.decodeWithSink(input);

    // Combine chunks at the end - use bufferConcat for safe combination
    return bufferConcat(chunks);
  }

  const decoder = new Lzma2Decoder(properties, outputSink as OutputSink);
  if (outputSink) {
    // Zero-copy mode: write to sink during decode
    return decoder.decodeWithSink(input);
  }
  // Buffering mode: returns Buffer (zero-copy)
  return decoder.decode(input, unpackSize);
}
