# xz-compat

Decompress XZ, LZMA, and LZMA2 data in Node.js. The package has a pure JavaScript fallback, optional native acceleration, and exports BCJ and Delta filters.

```bash
npm install xz-compat
```

The package targets Node.js 0.8 and newer. Use the CommonJS entry point on older Node.js versions; the ESM examples below require a runtime that supports ESM.

## XZ files

```js
import { readFileSync } from 'fs';
import { decodeXZ } from 'xz-compat';

const output = await decodeXZ(readFileSync('input.xz'));
console.log(output.length); // decompressed byte count
```

For large files, use the streaming transform:

```js
import { createReadStream, createWriteStream } from 'fs';
import { createXZDecoder } from 'xz-compat';

createReadStream('input.xz')
  .pipe(createXZDecoder())
  .pipe(createWriteStream('output'));
```

## Public API

| Export | Use |
| --- | --- |
| `decodeXZ(buffer)` | Decode a complete XZ container. Returns a promise for a Buffer-like result. |
| `createXZDecoder()` | Create a streaming XZ transform. |
| `decode7zLzma(data, properties, unpackSize)` | Decode raw LZMA data from a 7z entry. |
| `decode7zLzma2(data, properties, unpackSize?)` | Decode raw LZMA2 data from a 7z entry. |
| `decodeLzma(data, properties, outSize, sink?)` | Decode raw LZMA data synchronously. |
| `decodeLzma2(data, properties, unpackSize, sink?)` | Decode raw LZMA2 data synchronously. |
| `createLzmaDecoder(properties, outSize)` | Create a streaming LZMA transform. |
| `createLzma2Decoder(properties, unpackSize?)` | Create a streaming LZMA2 transform. |
| `decodeBcj*`, `createBcj*Decoder` | Decode or stream supported x86, ARM, ARM64, ARM Thumb, PowerPC, SPARC, and IA64 BCJ filters. |
| `decodeDelta(buffer, distance?)` | Decode a byte-level Delta filter. |
| `isNativeAvailable()` | Check whether the optional native decoder can load. |

The low-level LZMA APIs require codec properties and, for LZMA1, the expected output size. The 7z APIs accept those properties separately because that is how the 7z format stores them.

## Optional native acceleration

On Node.js 14 and newer, the decoder can use `lzma-native` on supported platforms. It falls back to JavaScript when the native module is unavailable. Native loading may try to install the module dynamically. Set `LZMA_NATIVE_DISABLE=1` to prevent that attempt.

The native path has no measured speed guarantee. Choose it for a native implementation when available, not for a fixed performance multiplier.

## Limits

This package decompresses; it does not create XZ or LZMA archives. Browser support is not tested.

## License

MIT
