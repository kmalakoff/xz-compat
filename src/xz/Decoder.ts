/**
 * XZ Decompression Module
 *
 * XZ is a container format that wraps LZMA2 compressed data.
 * This module provides both synchronous and streaming XZ decoders.
 *
 * Pure JavaScript implementation, works on Node.js 0.8+
 *
 * IMPORTANT: Buffer Management Pattern
 *
 * When calling decodeLzma2(), use the direct return pattern:
 *
 * ✅ CORRECT - Fast path:
 *   const output = decodeLzma2(data, props, size) as Buffer;
 *
 * ❌ WRONG - Slow path (do NOT buffer):
 *   const chunks: Buffer[] = [];
 *   decodeLzma2(data, props, size, { write: c => chunks.push(c) });
 *   return Buffer.concat(chunks);  // ← Unnecessary copies!
 */

import { Transform } from 'extract-base-iterator';
import type { Transform as TransformType } from 'stream';
import { decodeBcj } from '../filters/bcj/Bcj.ts';
import { decodeBcjArm } from '../filters/bcj/BcjArm.ts';
import { decodeBcjArm64 } from '../filters/bcj/BcjArm64.ts';
import { decodeBcjArmt } from '../filters/bcj/BcjArmt.ts';
import { decodeBcjIa64 } from '../filters/bcj/BcjIa64.ts';
import { decodeBcjPpc } from '../filters/bcj/BcjPpc.ts';
import { decodeBcjSparc } from '../filters/bcj/BcjSparc.ts';
import { decodeDelta } from '../filters/delta/Delta.ts';
import { decodeLzma2 } from '../lzma/index.ts';
import { tryLoadNative } from '../native.ts';

// XZ magic bytes
const XZ_MAGIC = [0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00];
const XZ_FOOTER_MAGIC = [0x59, 0x5a]; // "YZ"

// Filter IDs (from XZ specification)
const FILTER_DELTA = 0x03;
const FILTER_BCJ_X86 = 0x04;
const FILTER_BCJ_PPC = 0x05;
const FILTER_BCJ_IA64 = 0x06;
const FILTER_BCJ_ARM = 0x07;
const FILTER_BCJ_ARMT = 0x08;
const FILTER_BCJ_SPARC = 0x09;
const FILTER_BCJ_ARM64 = 0x0a;
const FILTER_LZMA2 = 0x21;

// Filter info for parsing
interface FilterInfo {
  id: number;
  props: Buffer;
}

/**
 * Simple buffer comparison
 */
function bufferEquals(buf: Buffer, offset: number, expected: number[]): boolean {
  if (offset + expected.length > buf.length) {
    return false;
  }
  for (let i = 0; i < expected.length; i++) {
    if (buf[offset + i] !== expected[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Decode variable-length integer (XZ multibyte encoding)
 * Returns number, but limits to 32-bit to work on Node 0.8+
 */
function decodeMultibyte(buf: Buffer, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let i = 0;
  let byte: number;
  do {
    if (offset + i >= buf.length) {
      throw new Error('Truncated multibyte integer');
    }
    byte = buf[offset + i];
    value |= (byte & 0x7f) << (i * 7);
    i++;
    if (i > 4) {
      // Reduced to prevent overflow on Node 0.8
      throw new Error('Multibyte integer too large');
    }
  } while (byte & 0x80);
  return { value, bytesRead: i };
}

/**
 * Apply a preprocessing filter (BCJ/Delta) to decompressed data
 */
function applyFilter(data: Buffer, filter: FilterInfo): Buffer {
  switch (filter.id) {
    case FILTER_BCJ_X86:
      return decodeBcj(data, filter.props);
    case FILTER_BCJ_ARM:
      return decodeBcjArm(data, filter.props);
    case FILTER_BCJ_ARM64:
      return decodeBcjArm64(data, filter.props);
    case FILTER_BCJ_ARMT:
      return decodeBcjArmt(data, filter.props);
    case FILTER_BCJ_PPC:
      return decodeBcjPpc(data, filter.props);
    case FILTER_BCJ_SPARC:
      return decodeBcjSparc(data, filter.props);
    case FILTER_BCJ_IA64:
      return decodeBcjIa64(data, filter.props);
    case FILTER_DELTA:
      return decodeDelta(data, filter.props);
    default:
      throw new Error(`Unsupported filter: 0x${filter.id.toString(16)}`);
  }
}

/**
 * Parse XZ Block Header to extract filters and LZMA2 properties
 */
function parseBlockHeader(
  input: Buffer,
  offset: number,
  _checkSize: number
): {
  filters: FilterInfo[];
  lzma2Props: Buffer;
  headerSize: number;
  dataStart: number;
  dataEnd: number;
  nextOffset: number;
} {
  // Block header size
  const blockHeaderSizeRaw = input[offset];
  if (blockHeaderSizeRaw === 0) {
    throw new Error('Invalid block header size (index indicator found instead of block)');
  }
  const blockHeaderSize = (blockHeaderSizeRaw + 1) * 4;

  // Parse block header
  const blockHeaderStart = offset;
  offset++; // skip size byte

  const blockFlags = input[offset++];
  const numFilters = (blockFlags & 0x03) + 1;
  const hasCompressedSize = (blockFlags & 0x40) !== 0;
  const hasUncompressedSize = (blockFlags & 0x80) !== 0;

  // Skip optional sizes
  if (hasCompressedSize) {
    const result = decodeMultibyte(input, offset);
    offset += result.bytesRead;
  }

  if (hasUncompressedSize) {
    const result = decodeMultibyte(input, offset);
    offset += result.bytesRead;
  }

  // Parse all filters
  const filters: FilterInfo[] = [];
  let lzma2Props: Buffer | null = null;

  for (let i = 0; i < numFilters; i++) {
    const filterIdResult = decodeMultibyte(input, offset);
    const filterId = filterIdResult.value;
    offset += filterIdResult.bytesRead;

    const propsSizeResult = decodeMultibyte(input, offset);
    offset += propsSizeResult.bytesRead;

    const filterProps = input.slice(offset, offset + propsSizeResult.value);
    offset += propsSizeResult.value;

    if (filterId === FILTER_LZMA2) {
      // LZMA2 must be the last filter
      lzma2Props = filterProps;
    } else if (filterId === FILTER_DELTA || (filterId >= FILTER_BCJ_X86 && filterId <= FILTER_BCJ_ARM64)) {
      // Preprocessing filter - store for later application
      filters.push({ id: filterId, props: filterProps });
    } else {
      throw new Error(`Unsupported filter: 0x${filterId.toString(16)}`);
    }
  }

  if (!lzma2Props) {
    throw new Error('No LZMA2 filter found in XZ block');
  }

  // Skip to end of block header (must be aligned to 4 bytes)
  const blockDataStart = blockHeaderStart + blockHeaderSize;

  return {
    filters,
    lzma2Props,
    headerSize: blockHeaderSize,
    dataStart: blockDataStart,
    dataEnd: input.length,
    nextOffset: blockDataStart,
  };
}

/**
 * Parse XZ Index to get block positions
 *
 * XZ Index stores "Unpadded Size" for each block which equals:
 * Block Header Size + Compressed Data Size + Check Size
 * (does NOT include padding to 4-byte boundary)
 */
function parseIndex(
  input: Buffer,
  indexStart: number,
  checkSize: number
): Array<{
  compressedPos: number;
  compressedDataSize: number;
  uncompressedSize: number;
}> {
  let offset = indexStart;

  // Index indicator (0x00)
  if (input[offset] !== 0x00) {
    throw new Error('Invalid index indicator');
  }
  offset++;

  // Number of records
  const countResult = decodeMultibyte(input, offset);
  const recordCount = countResult.value;
  offset += countResult.bytesRead;

  const records: Array<{
    compressedPos: number;
    unpaddedSize: number;
    compressedDataSize: number;
    uncompressedSize: number;
  }> = [];

  // Parse each record
  for (let i = 0; i < recordCount; i++) {
    // Unpadded Size (header + compressed data + check)
    const unpaddedResult = decodeMultibyte(input, offset);
    offset += unpaddedResult.bytesRead;

    // Uncompressed size
    const uncompressedResult = decodeMultibyte(input, offset);
    offset += uncompressedResult.bytesRead;

    records.push({
      compressedPos: 0, // will be calculated
      unpaddedSize: unpaddedResult.value,
      compressedDataSize: 0, // will be calculated
      uncompressedSize: uncompressedResult.value,
    });
  }

  // Calculate actual positions by walking through blocks
  let currentPos = 12; // After stream header
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    // Record where this block's header starts
    record.compressedPos = currentPos;

    // Get block header size from the actual data
    const headerSizeRaw = input[currentPos];
    const headerSize = (headerSizeRaw + 1) * 4;

    // Calculate compressed data size from unpadded size
    // unpaddedSize = headerSize + compressedDataSize + checkSize
    record.compressedDataSize = record.unpaddedSize - headerSize - checkSize;

    // Move to next block: unpaddedSize + padding to 4-byte boundary
    const paddedSize = Math.ceil(record.unpaddedSize / 4) * 4;
    currentPos += paddedSize;
  }

  return records;
}

/**
 * Decompress XZ data synchronously
 * Uses @napi-rs/lzma if available on Node 14+, falls back to pure JS
 * Properly handles multi-block XZ files and stream padding
 * @param input - XZ compressed data
 * @returns Decompressed data
 */
export function decodeXZ(input: Buffer): Buffer {
  // Try native acceleration first (Node 14+ with @napi-rs/lzma installed)
  const native = tryLoadNative();
  if (native) {
    return native.xz.decompressSync(input);
  }

  // Verify XZ magic
  if (input.length < 12 || !bufferEquals(input, 0, XZ_MAGIC)) {
    throw new Error('Invalid XZ magic bytes');
  }

  // Stream flags at offset 6-7
  const checkType = input[7] & 0x0f;

  // Check sizes based on check type
  const checkSizes: { [key: number]: number } = {
    0: 0, // None
    1: 4, // CRC32
    4: 8, // CRC64
    10: 32, // SHA-256
  };
  const checkSize = checkSizes[checkType] ?? 0;

  // Find footer by skipping stream padding (null bytes at end before footer)
  // Stream padding must be multiple of 4 bytes
  let footerEnd = input.length;
  while (footerEnd > 12 && input[footerEnd - 1] === 0x00) {
    footerEnd--;
  }
  // Align to 4-byte boundary (stream padding rules)
  while (footerEnd % 4 !== 0 && footerEnd > 12) {
    footerEnd++;
  }

  // Verify footer magic (at footerEnd - 2)
  if (!bufferEquals(input, footerEnd - 2, XZ_FOOTER_MAGIC)) {
    throw new Error('Invalid XZ footer magic');
  }

  // Get backward size (tells us where index starts) - at footerEnd - 8
  const backwardSize = (input.readUInt32LE(footerEnd - 8) + 1) * 4;
  const indexStart = footerEnd - 12 - backwardSize;

  // Parse Index to get block information
  const blockRecords = parseIndex(input, indexStart, checkSize);

  // Decompress each block
  const outputChunks: Buffer[] = [];
  let _totalOutputSize = 0;

  for (let i = 0; i < blockRecords.length; i++) {
    const record = blockRecords[i];
    const recordStart = record.compressedPos;

    // Parse block header
    const blockInfo = parseBlockHeader(input, recordStart, checkSize);

    // Extract compressed data for this block
    const dataStart = recordStart + blockInfo.headerSize;
    // compressedDataSize is calculated from the Index's Unpadded Size minus header and check
    const dataEnd = dataStart + record.compressedDataSize;

    // Note: XZ blocks have padding AFTER the check field to align to 4 bytes,
    // but the compressedSize from index is exact - no need to strip padding.
    // LZMA2 data includes a 0x00 end marker which must NOT be stripped.
    const compressedData = input.slice(dataStart, dataEnd);

    // Decompress this block with LZMA2 (fast path, no buffering)
    let blockOutput = decodeLzma2(compressedData, blockInfo.lzma2Props, record.uncompressedSize) as Buffer;

    // Apply preprocessing filters in reverse order (BCJ/Delta applied after LZMA2)
    // Filters are stored in order they were applied during compression,
    // so we need to reverse for decompression
    for (let j = blockInfo.filters.length - 1; j >= 0; j--) {
      blockOutput = applyFilter(blockOutput, blockInfo.filters[j]) as Buffer;
    }

    outputChunks.push(blockOutput);
    _totalOutputSize += blockOutput.length;
  }

  return Buffer.concat(outputChunks);
}

/**
 * Create an XZ decompression Transform stream
 * @returns Transform stream that decompresses XZ data
 */
export function createXZDecoder(): TransformType {
  const chunks: Buffer[] = [];

  return new Transform({
    transform(chunk: Buffer, _encoding: string, callback: (error?: Error | null) => void) {
      chunks.push(chunk);
      callback();
    },

    flush(callback: (error?: Error | null) => void) {
      try {
        const input = Buffer.concat(chunks);
        const output = decodeXZ(input);
        this.push(output);
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}
