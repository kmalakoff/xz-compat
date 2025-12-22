/**
 * Native Acceleration Module
 *
 * Provides optional native acceleration via @napi-rs/lzma on Node.js 14+.
 * Falls back gracefully to pure JS implementation on older Node versions
 * or when the native module is not available.
 */

import Module from 'module';
import path from 'path';
import url from 'url';

// Get __dirname for ES modules
const _require = typeof require === 'undefined' ? Module.createRequire(import.meta.url) : require;
const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));

// Get node_modules path (go up from dist/cjs to package root, then to node_modules)
const nodeModulesPath = path.join(__dirname, '..', '..', 'node_modules');
const major = +process.versions.node.split('.')[0];

// Cache for native module loading result
let nativeModule: NativeModule | null = null;
let installationAttempted = false;

interface NativeModule {
  xz: {
    decompressSync(input: Uint8Array): Buffer;
    decompress(input: Uint8Array, signal?: AbortSignal | null): Promise<Buffer>;
  };
  lzma: {
    decompressSync(input: Uint8Array): Buffer;
    decompress(input: Uint8Array, signal?: AbortSignal | null): Promise<Buffer>;
  };
  lzma2: {
    decompressSync(input: Uint8Array): Buffer;
    decompress(input: Uint8Array, signal?: AbortSignal | null): Promise<Buffer>;
  };
}

/**
 * Try to load the native @napi-rs/lzma module
 * Returns null if not available or Node version is too old
 */
export function tryLoadNative(): NativeModule | null {
  if (major < 14) return null;
  if (installationAttempted) return nativeModule;
  installationAttempted = true;

  // check if installed already
  try {
    nativeModule = _require('@napi-rs/lzma') as NativeModule;
    return nativeModule;
  } catch {}

  // try to install
  try {
    console.log('Installing @napi-rs/lzma for native acceleration...');
    const installModule = _require('install-module-linked').default;
    installModule.sync('@napi-rs/lzma', nodeModulesPath, {});
    nativeModule = _require('@napi-rs/lzma') as NativeModule;
    return nativeModule;
  } catch {
    return null;
  }
}

export function isNativeAvailable(): boolean {
  return tryLoadNative() !== null;
}
