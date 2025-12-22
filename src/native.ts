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

// Cache for native module loading result
let nativeModule: NativeModule | null | undefined;
let nodeVersionChecked = false;
let nodeVersionSupported = false;
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
 * Install @napi-rs/lzma using install-module-linked
 */
function installNativeModule(callback: (err: Error | null) => void): void {
  // Only attempt installation once
  if (installationAttempted) {
    callback(new Error('Installation already attempted'));
    return;
  }
  installationAttempted = true;

  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const installModule = _require('install-module-linked').default;

    console.log('Installing @napi-rs/lzma for native acceleration...');
    installModule('@napi-rs/lzma', nodeModulesPath, {}, (err: Error | null) => {
      if (err) {
        console.warn('Failed to install @napi-rs/lzma:', err.message);
      } else {
        console.log('Successfully installed @napi-rs/lzma');
      }
      callback(err);
    });
  } catch (err) {
    callback(err as Error);
  }
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

  // Try to load native module (it should be installed at module load time)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    nativeModule = _require('@napi-rs/lzma') as NativeModule;
    return nativeModule;
  } catch {
    // Module not installed yet - return null
    nativeModule = null;
    return null;
  }
}

// At module load time, attempt to install @napi-rs/lzma on Node 14+
// This is done asynchronously so it doesn't block module initialization
if (checkNodeVersion()) {
  installNativeModule(() => {
    // Installation complete - clear cache and try to load
    nativeModule = undefined; // Clear cache to force re-check
    try {
      nativeModule = _require('@napi-rs/lzma') as NativeModule;
    } catch {
      // Module still not available
      nativeModule = null;
    }
  });
}

/**
 * Check if native acceleration is available
 */
export function isNativeAvailable(): boolean {
  return tryLoadNative() !== null;
}
