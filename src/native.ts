/**
 * Native Acceleration Module
 *
 * Provides optional native acceleration via @napi-rs/lzma on Node.js 14+.
 * Falls back gracefully to pure JS implementation on older Node versions
 * or when the native module is not available.
 */

// Cache for native module loading result
let nativeModule: NativeModule | null | undefined;
let nodeVersionChecked = false;
let nodeVersionSupported = false;

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
 * Check if Node.js version supports native module (14+)
 */
function checkNodeVersion(): boolean {
  if (nodeVersionChecked) return nodeVersionSupported;
  nodeVersionChecked = true;

  try {
    const version = process.versions.node;
    const major = parseInt(version.split('.')[0], 10);
    nodeVersionSupported = major >= 14;
  } catch {
    nodeVersionSupported = false;
  }

  return nodeVersionSupported;
}

/**
 * Try to load the native @napi-rs/lzma module
 * Returns null if not available or Node version is too old
 */
export function tryLoadNative(): NativeModule | null {
  // Return cached result
  if (nativeModule !== undefined) return nativeModule;

  // Check Node version first
  if (!checkNodeVersion()) {
    nativeModule = null;
    return null;
  }

  // Try to load native module
  try {
    // Use require to load optional dependency
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = require('@napi-rs/lzma') as NativeModule;
    return nativeModule;
  } catch {
    nativeModule = null;
    return null;
  }
}

/**
 * Check if native acceleration is available
 */
export function isNativeAvailable(): boolean {
  return tryLoadNative() !== null;
}
