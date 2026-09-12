/**
 * Download and cache test fixtures
 * Node 0.8 compatible
 */
import { execFile as execFileCallback } from 'child_process';
import fs from 'fs';
import { safeRm } from 'fs-remove-compat';
import getFile from 'get-file-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import { CACHE_DIR } from './constants.ts';

// XZ test data repository configuration
const XZ_CACHE_DIR = path.join(CACHE_DIR, 'xz');
const XZ_REPO_URL = 'https://github.com/tukaani-project/xz.git';
const XZ_COMMIT = 'ebb0e6789cefe3be71756881aa8f2009fda9938c';

const EXPECTED_FILES = [
  'tests/files/good-0-empty.xz',
  'tests/files/good-0pad-empty.xz',
  'tests/files/good-0cat-empty.xz',
  'tests/files/good-0catpad-empty.xz',
  'tests/files/good-1-check-none.xz',
  'tests/files/good-1-check-crc32.xz',
  'tests/files/good-1-check-crc64.xz',
  'tests/files/good-1-check-sha256.xz',
  'tests/files/good-1-block_header-1.xz',
  'tests/files/good-1-block_header-2.xz',
  'tests/files/good-1-block_header-3.xz',
  'tests/files/good-1-lzma2-1.xz',
  'tests/files/good-1-lzma2-2.xz',
  'tests/files/good-1-lzma2-3.xz',
  'tests/files/good-1-lzma2-4.xz',
  'tests/files/good-1-lzma2-5.xz',
  'tests/files/good-2-lzma2.xz',
  'tests/files/bad-0-header_magic.xz',
  'tests/files/bad-0-footer_magic.xz',
  'tests/files/bad-0-empty-truncated.xz',
  'tests/files/bad-1-lzma2-1.xz',
  'tests/files/bad-1-lzma2-6.xz',
  'tests/files/unsupported-filter_flags-1.xz',
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

function git(args: string[], cwd: string | undefined, callback: (err: Error | null, stdout: string) => void): void {
  execFileCallback('git', args, cwd ? { cwd } : undefined, (err: Error | null, stdout: string | Buffer | undefined) => callback(err, stdout?.toString() ?? ''));
}

function removeRepo(targetDir: string, callback: (err?: Error | null) => void): void {
  safeRm(targetDir, { recursive: true, force: true }, callback);
}

function cloneRepo(targetDir: string, callback: (err?: Error | null) => void): void {
  mkdirp(path.dirname(targetDir), (mkdirErr: Error | null) => {
    if (mkdirErr) return callback(mkdirErr);
    git(['init', targetDir], undefined, (initErr) => {
      if (initErr) return callback(initErr);
      git(['remote', 'add', 'origin', XZ_REPO_URL], targetDir, (remoteErr) => {
        if (remoteErr) return callback(remoteErr);
        git(['fetch', '--depth', '1', 'origin', XZ_COMMIT], targetDir, (fetchErr) => {
          if (fetchErr) return callback(fetchErr);
          git(['checkout', '--detach', XZ_COMMIT], targetDir, (checkoutErr) => callback(checkoutErr));
        });
      });
    });
  });
}

function hasExpectedCommit(targetDir: string, callback: (err?: Error | null, matches?: boolean) => void): void {
  git(['rev-parse', 'HEAD'], targetDir, (err, stdout) => {
    if (err) return callback(null, false);
    callback(null, stdout.trim() === XZ_COMMIT && hasRequiredFiles(targetDir));
  });
}

/**
 * Clone or update the XZ repository (callback-based, Node 0.8 compatible)
 */
function cloneOrUpdateRepo(targetDir: string, callback: (err?: Error | null) => void): void {
  if (directoryExists(targetDir)) {
    return hasExpectedCommit(targetDir, (verifyErr, matches) => {
      if (verifyErr) return callback(verifyErr);
      if (matches) return callback();
      removeRepo(targetDir, (removeErr) => {
        if (removeErr) return callback(removeErr);
        cloneRepo(targetDir, callback);
      });
    });
  }
  cloneRepo(targetDir, callback);
}

/**
 * Ensure XZ test data is available in .tmp/cache/xz
 */
export function ensureXZTestData(callback: (err?: Error | null) => void): void {
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

      getFile(url, filepath, (downloadErr: Error | null) => {
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
