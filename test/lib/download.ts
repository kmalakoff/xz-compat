/**
 * Download and cache test fixtures
 * Node 0.8 compatible
 */
import { exec as execCallback } from 'child_process';
import fs from 'fs';
import getFile from 'get-file-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import { CACHE_DIR } from './constants.ts';

// XZ test data repository configuration
const XZ_CACHE_DIR = path.join(CACHE_DIR, 'xz');
const XZ_REPO_URL = 'https://github.com/tukaani-project/xz.git';

const EXPECTED_FILES = [
  'tests/test_bcj_exact_size.c',
  'tests/test_index_hash.c',
  'src/liblzma/simple/x86.c',
  'src/liblzma/simple/arm.c',
  'src/liblzma/simple/arm64.c',
  'src/liblzma/simple/armthumb.c',
  'src/liblzma/simple/powerpc.c',
  'src/liblzma/simple/sparc.c',
  'src/liblzma/simple/ia64.c',
  'src/liblzma/delta/delta_decoder.c',
];

/**
 * Check if directory exists
 */
function directoryExists(dirPath: string): boolean {
  try {
    const stats = fs.statSync(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Check if required files exist in the cached directory
 */
function hasRequiredFiles(dirPath: string): boolean {
  for (let i = 0; i < EXPECTED_FILES.length; i++) {
    const file = EXPECTED_FILES[i];
    const filePath = path.join(dirPath, file);
    if (!fs.existsSync(filePath)) {
      return false;
    }
  }
  return true;
}

/**
 * Clone or update the XZ repository (callback-based, Node 0.8 compatible)
 */
function cloneOrUpdateRepo(targetDir: string, callback: (err?: Error) => void): void {
  if (directoryExists(targetDir)) {
    if (hasRequiredFiles(targetDir)) {
      return callback();
    }
    execCallback('git pull --force', { cwd: targetDir }, (err: Error | null) => {
      if (err) {
        execCallback(`rm -rf "${targetDir}"`, (rmErr: Error | null) => {
          if (rmErr) return callback(rmErr);
          execCallback(`git clone --depth 1 "${XZ_REPO_URL}" "${targetDir}"`, (cloneErr: Error | null) => {
            callback(cloneErr || undefined);
          });
        });
      } else {
        callback();
      }
    });
  } else {
    execCallback(`git clone --depth 1 "${XZ_REPO_URL}" "${targetDir}"`, (err: Error | null) => {
      callback(err || undefined);
    });
  }
}

/**
 * Ensure XZ test data is available in .cache/xz
 */
export function ensureXZTestData(callback: (err?: Error) => void): void {
  cloneOrUpdateRepo(XZ_CACHE_DIR, callback);
}

/**
 * Get the path to XZ cache directory
 */
export function getXZCacheDir(): string {
  return XZ_CACHE_DIR;
}

/**
 * Download file to cache if not present
 * @param url - URL to download from
 * @param filename - Local filename to save as
 * @param callback - Called with (err, filepath)
 */
export function downloadFixture(url: string, filename: string, callback: (err: Error | null, filepath?: string) => void): void {
  const filepath = path.join(CACHE_DIR, filename);

  // Check if already cached
  fs.stat(filepath, (statErr) => {
    if (!statErr) {
      // Already exists
      return callback(null, filepath);
    }

    // Create cache directory
    mkdirp(CACHE_DIR, (mkdirErr: Error | null) => {
      if (mkdirErr) return callback(mkdirErr);

      getFile(url, filepath, (downloadErr?: Error) => {
        if (downloadErr) return callback(downloadErr);
        callback(null, filepath);
      });
    });
  });
}

/**
 * Get the path to a cached fixture
 */
export function getFixturePath(filename: string): string {
  return path.join(CACHE_DIR, filename);
}
