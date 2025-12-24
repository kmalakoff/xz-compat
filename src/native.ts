/**
 * Native Acceleration Module
 *
 * Provides optional native acceleration via lzma-native on Node.js 10+.
 * Falls back gracefully to pure JS implementation on older Node versions
 * or when the native module is not available.
 */

import Module from 'module';
import path from 'path';
import url from 'url';

import { parseLzma2DictionarySize, parseProperties } from './lzma/types.ts';

// Get __dirname for ES modules
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;
const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));

// Get node_modules path (go up from dist/cjs to package root, then to node_modules)
const nodeModulesPath = path.join(__dirname, '..', '..', 'node_modules');
const major = +process.versions.node.split('.')[0];

const nativeDisabled = process.env.LZMA_NATIVE_DISABLE === '1';
const NATIVE_PREBUILDS = ['darwin-arm64', 'darwin-x64', 'linux-arm64', 'linux-x64', 'win32-ia32', 'win32-x64'];

// Cache for native module loading result
let nativeModule: NativeModule | null = null;
let installationAttempted = false;

interface NativeDecoderMethods {
  decompress(input: Buffer): Promise<Buffer>;
}

type RawDecoder = (input: Buffer, properties: Buffer, unpackSize?: number) => Promise<Buffer>;

export interface NativeModule {
  xz?: NativeDecoderMethods;
  lzma?: RawDecoder;
  lzma2?: RawDecoder;
}

interface LzmaNativeExports {
  decompress(input: Buffer, options?: unknown): Promise<Buffer>;
  createStream(coder?: string | Record<string, unknown>, options?: Record<string, unknown>): NodeJS.ReadWriteStream;
  FILTER_LZMA1: string;
  FILTER_LZMA2: string;
}

interface RawFilterOptions {
  dictSize: number;
  lc?: number;
  lp?: number;
  pb?: number;
}

const sizeMismatchError = (expected: number, actual: number): Error => new Error(`Native decode size mismatch (expected ${expected}, got ${actual})`);

function collectStream(stream: NodeJS.ReadWriteStream, input: Buffer, expectedSize?: number): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];

    stream.on('data', (chunk: Buffer) => {
      chunks.push(chunk);
    });
    stream.once('error', reject);
    stream.once('end', () => {
      const output = chunks.length === 1 ? chunks[0] : Buffer.concat(chunks);
      if (typeof expectedSize === 'number' && expectedSize >= 0 && output.length !== expectedSize) {
        reject(sizeMismatchError(expectedSize, output.length));
        return;
      }
      resolve(output);
    });

    stream.end(input);
  });
}

function createRawDecoder(lzma: LzmaNativeExports, filterId: string, buildOptions: (properties: Buffer) => RawFilterOptions): RawDecoder {
  return (input, properties, unpackSize) => {
    const filters = [
      {
        id: filterId,
        options: buildOptions(properties),
      },
    ];
    const stream = lzma.createStream('rawDecoder', { filters });
    return collectStream(stream, input, unpackSize);
  };
}

function createNativeModule(bindings: LzmaNativeExports): NativeModule {
  return {
    xz: {
      decompress: (input) => bindings.decompress(input),
    },
    lzma: createRawDecoder(bindings, bindings.FILTER_LZMA1, (properties) => {
      if (!properties || properties.length < 5) throw new Error('LZMA requires 5-byte properties');
      const { lc, lp, pb, dictionarySize } = parseProperties(properties);
      return {
        dictSize: dictionarySize,
        lc,
        lp,
        pb,
      };
    }),
    lzma2: createRawDecoder(bindings, bindings.FILTER_LZMA2, (properties) => {
      if (!properties || properties.length < 1) throw new Error('LZMA2 requires properties byte');
      return {
        dictSize: parseLzma2DictionarySize(properties[0]),
      };
    }),
  };
}

/**
 * Try to load the native lzma-native module
 * Returns null if not available or Node version is too old
 */
export function tryLoadNative(): NativeModule | null {
  if (installationAttempted) return nativeModule;
  installationAttempted = true;
  if (nativeDisabled) return null;
  if (major < 14) return null;
  if (NATIVE_PREBUILDS.indexOf(`${process.platform}-${process.arch}`) < 0) return null; // only supported prebuilds (or else tries to build from source on install)

  const load = (): NativeModule | null => {
    try {
      const bindings = _require('lzma-native') as LzmaNativeExports;
      nativeModule = createNativeModule(bindings);
      return nativeModule;
    } catch {
      return null;
    }
  };

  const loaded = load();
  if (loaded) return loaded;

  try {
    console.log('Installing lzma-native for native acceleration...');
    const installModule = _require('install-module-linked').default;
    installModule.sync('lzma-native', nodeModulesPath, {});
    return load();
  } catch {
    return null;
  }
}

export function isNativeAvailable(): boolean {
  return tryLoadNative() !== null;
}
