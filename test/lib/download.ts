/**
 * Download and cache test fixtures
 * Node 0.8 compatible
 */
import { execFile as execFileCallback } from 'child_process';
import fs from 'fs';
import getFile from 'get-file-compat';
import path from 'path';
import { stagedCache, verifySha256 } from 'staged-cache';
import { SHARED_DIR, SHARED_ROOT } from './constants.ts';

// XZ test data repository configuration
const XZ_REPO_URL = 'https://github.com/tukaani-project/xz.git';
const XZ_COMMIT = 'ebb0e6789cefe3be71756881aa8f2009fda9938c';
const XZ_CACHE_DIR = path.join(SHARED_ROOT, `xz-${XZ_COMMIT}`);

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

/**
 * Ensure the XZ test data checkout at the pinned commit is in .cache/shared/xz-<commit>
 */
export function ensureXZTestData(callback: (err?: Error | null) => void): void {
  stagedCache(
    XZ_CACHE_DIR,
    {
      verify: (dir: string, cb: (err: Error | null, valid?: boolean) => void) => {
        git(['rev-parse', 'HEAD'], dir, (err, stdout) => cb(null, !err && stdout.trim() === XZ_COMMIT && hasRequiredFiles(dir)));
      },
      build: (staging: string, cb: (err?: Error | null) => void) => {
        git(['init', staging], undefined, (initErr) => {
          if (initErr) return cb(initErr);
          git(['fetch', '--depth', '1', XZ_REPO_URL, XZ_COMMIT], staging, (fetchErr) => {
            if (fetchErr) return cb(fetchErr);
            git(['checkout', '--detach', 'FETCH_HEAD'], staging, (checkoutErr) => cb(checkoutErr));
          });
        });
      },
    },
    (err) => callback(err)
  );
}

/**
 * Get the path to XZ cache directory
 */
export function getXZCacheDir(): string {
  return XZ_CACHE_DIR;
}

export interface DownloadedArtifact {
  url: string;
  filename: string;
  sha256: string;
}

/**
 * Download an artifact into the shared cache; a valid copy is reused, anything else is built, verified and renamed into place.
 */
export function downloadFixture(artifact: DownloadedArtifact, callback: (err?: Error | null, filepath?: string) => void): void {
  stagedCache(
    getFixturePath(artifact.filename),
    {
      verify: verifySha256(artifact.sha256),
      build: (staging: string, cb: (err?: Error | null) => void) => {
        getFile(artifact.url, staging, (err: Error | null, res?: { statusCode?: number }) => {
          cb(err || (res && res.statusCode !== 200 ? new Error(`HTTP ${res.statusCode}: ${artifact.url}`) : null));
        });
      },
    },
    callback
  );
}

/**
 * Get the path to a cached fixture
 */
export function getFixturePath(filename: string): string {
  return path.join(SHARED_DIR, filename);
}
