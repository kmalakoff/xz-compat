# xz-compat

**XZ Decompression Library**

xz-compat is a complete pure JavaScript implementation of XZ decompression with support for LZMA2 compression, BCJ filters (Branch Conversion for various CPU architectures), and Delta filtering. Compatible with Node.js 0.8+.

## Features

- ✅ **XZ Format Support**: Full XZ container format decoding
- ✅ **LZMA2 Decoder**: Complete LZMA2 decompression implementation
- ✅ **BCJ Filters**: Branch conversion for improved compression on executables
  - x86 (32-bit)
  - ARM (32-bit)
  - ARM64 / AArch64
  - ARM Thumb
  - PowerPC
  - SPARC
  - IA64 / Itanium
- ✅ **Delta Filter**: Byte-level delta encoding
- ✅ **Streaming & Sync**: Both streaming transforms and synchronous decoding
- ✅ **Node 0.8+**: Works on legacy Node.js versions
- ✅ **No Native Dependencies**: Pure JavaScript, no compilation required

## Installation

```bash
npm install xz-compat
```

## Quick Start

### Synchronous XZ Decompression

```javascript
import { readFileSync } from 'fs';
import { decodeXZ } from 'xz-compat';

const compressedData = readFileSync('file.xz');
const decompressedData = decodeXZ(compressedData);
console.log('Decompressed:', decompressedData.toString());
```

### Streaming XZ Decompression

```javascript
import { createReadStream } from 'fs';
import { createXZDecoder } from 'xz-compat';

const input = createReadStream('file.xz');
const decoder = createXZDecoder();

input.pipe(decoder);
decoder.on('data', (chunk) => {
  console.log('Decompressed chunk:', chunk);
});
```

### LZMA2 Decompression

```javascript
import { decodeLzma2 } from 'xz-compat';
import { writeFileSync } from 'fs';

const lzma2Data = readFileSync('data.lzma2');
const chunks = [];

decodeLzma2(lzma2Data, lzma2Properties, expectedSize, {
  write: (chunk) => {
    chunks.push(chunk);
  }
});

const decompressed = Buffer.concat(chunks);
writeFileSync('output.bin', decompressed);
```

### Using BCJ Filters Directly

```javascript
import { decodeBcj, decodeBcjArm } from 'xz-compat';

// Decode x86 BCJ filtered data
const x86Data = readFileSync('filtered-x86.bin');
const unfiltered = decodeBcj(x86Data);

// Decode ARM BCJ filtered data
const armData = readFileSync('filtered-arm.bin');
const unfilteredArm = decodeBcjArm(armData);
```

## API Reference

### XZ Decompression

#### `decodeXZ(buffer: Buffer): Buffer`
Synchronously decompresses XZ format data.

#### `createXZDecoder(): Transform`
Creates a streaming Transform for XZ decompression.

### LZMA2 Decompression

#### `decodeLzma2(buffer: Buffer, properties: Buffer, unpackSize: number, sink: OutputSink): void`
Synchronously decodes LZMA2 compressed data.

#### `createLzma2Decoder(properties: Buffer, unpackSize: number): Transform`
Creates a streaming Transform for LZMA2 decompression.

### BCJ Filters

Branch Conversion (BCJ) filters improve compression of executables by converting relative branch addresses to absolute addresses, creating more repetitive patterns.

All BCJ filters follow the same interface:
- `decodeBcj*(buffer: Buffer, properties?: Buffer, unpackSize?: number): Buffer`
- `createBcj*Decoder(properties?: Buffer, unpackSize?: number): Transform`

Supported BCJ filters:
- `decodeBcj` / `createBcjDecoder` - x86 (32-bit)
- `decodeBcjArm` / `createBcjArmDecoder` - ARM (32-bit)
- `decodeBcjArm64` / `createBcjArm64Decoder` - ARM64 / AArch64
- `decodeBcjArmt` / `createBcjArmtDecoder` - ARM Thumb
- `decodeBcjPpc` / `createBcjPpcDecoder` - PowerPC
- `decodeBcjSparc` / `createBcjSparcDecoder` - SPARC
- `decodeBcjIa64` / `createBcjIa64Decoder` - IA64 / Itanium

### Delta Filter

#### `decodeDelta(buffer: Buffer, distance?: Buffer): Buffer`
Decodes Delta filtered data (inter-byte differences).

## Use Cases

### 1. Decompressing XZ Archives

```javascript
import { createReadStream } from 'fs';
import { createXZDecoder } from 'xz-compat';
import { pipeline } from 'stream/promises';

async function decompressXZ(inputPath, outputPath) {
  await pipeline(
    createReadStream(inputPath),
    createXZDecoder(),
    createWriteStream(outputPath)
  );
}
```

### 2. Working with LZMA Compressed Files

```javascript
import { decodeLzma2 } from 'xz-compat';

// Decompress raw LZMA2 stream
const data = readFileSync('data.lzma2');
const chunks = [];

decodeLzma2(data, propertiesBuffer, uncompressedSize, {
  write: (chunk) => chunks.push(chunk)
});

const result = Buffer.concat(chunks);
```

### 3. Batch Processing Compressed Files

```javascript
import { decodeXZ } from 'xz-compat';

function processXZFiles(filePaths) {
  return filePaths.map(file => {
    const compressed = readFileSync(file);
    const decompressed = decodeXZ(compressed);
    // Process decompressed data
    return processData(decompressed);
  });
}
```

## Technical Details

### XZ Format Structure

XZ is a container format that wraps LZMA2 compressed data:
1. Stream Header
2. One or more Blocks (each with Block Header + Compressed Data)
3. Index (records block positions)
4. Stream Footer

Each Block can contain:
- A chain of preprocessing filters (Delta, BCJ)
- LZMA2 compression

### BCJ Filter Algorithm

BCJ filters convert branch instructions in executable code:

**x86 Example:**
- Original: `E8 xx xx xx xx` (CALL with relative offset)
- Converted: `E8 aa aa aa aa` (CALL with absolute address)

This creates more repetitive patterns for better LZMA2 compression.

### Reference Implementation

This implementation is based on the reference XZ Utils (XZ Embedded) codebase:
- [XZ Utils GitHub](https://github.com/tukaani-project/xz)
- Filter algorithms match the xz embedded reference implementations

## Compatibility

- **Node.js**: 0.8 and above
- **Browser**: Not tested (designed for Node.js)
- **Dependencies**: None (pure JavaScript)

## Differences from Native XZ

This is a **decompression-only** implementation focused on compatibility and ease of use:
- No compression support (only decompression)
- Simplified streaming interface
- Pure JavaScript (no native bindings)
- Optimized for readability and maintainability

## Performance

Performance characteristics:
- **Synchronous**: Suitable for small to medium files
- **Streaming**: Memory-efficient for large files
- **Trade-off**: Pure JavaScript may be slower than native implementations
- **BCJ Decoding**: Optimized reference algorithm implementations

## License

MIT

## Contributing

Contributions welcome! Please ensure tests pass:

```bash
npm test
```

## References

- [XZ Format Specification](https://tukaani.org/xz/xz-file-format.txt)
- [LZMA SDK](https://www.7-zip.org/sdk.html)
- [XZ Utils](https://tukaani.org/xz/)