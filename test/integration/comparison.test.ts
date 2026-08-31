/**
 * Comparison tests between native tar/xz and xz-compat + tar-iterator
 *
 * These tests download real-world archives (Node.js distributions) and compare
 * the extracted results between system tools and xz-compat + tar-iterator to verify they
 * produce identical output.
 */

import { exec as execCallback } from 'child_process';
import spawnCallback from 'cross-spawn-cb';
import fs from 'fs';
import Iterator, { type Entry } from 'fs-iterator';
import { safeRmSync } from 'fs-remove-compat';
import getFile from 'get-file-compat';
import mkdirp from 'mkdirp-classic';
import path from 'path';
import TarIterator from 'tar-iterator';
import url from 'url';
import { createXZDecoder } from 'xz-compat';
import { ensureXZTestData } from '../lib/download.ts';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
// Use separate directories from other tests to avoid cleanup conflicts
const TMP_DIR = path.join(__dirname, '..', '..', '.tmp', 'comparison');
const CACHE_DIR = path.join(__dirname, '..', '..', '.cache');
const FIXTURES_DIR = path.join(__dirname, '..', 'fixtures');

const isWindows = process.platform === 'win32';

type NativeExtractFn = (cachePath: string, tmpDir: string, callback: (err?: Error | null) => void) => void;

const nativeExtractTarXzUnix: NativeExtractFn = (cachePath, tmpDir, callback) => {
  spawnCallback('tar', ['-xJf', cachePath, '-C', tmpDir], (err?: Error | null) => callback(err || undefined));
};

const nativeExtractTarXzWindows: NativeExtractFn = (cachePath, tmpDir, callback) => {
  const tarPath = path.join(tmpDir, path.basename(cachePath, '.xz'));
  spawnCallback('7z', ['x', '-y', `-o${tmpDir}`, cachePath], (err?: Error | null) => {
    if (err) return callback(err);
    spawnCallback('7z', ['x', '-y', `-o${tmpDir}`, tarPath], (err?: Error | null) => {
      try {
        fs.unlinkSync(tarPath);
      } catch (_) {}
      callback(err || undefined);
    });
  });
};

// On Linux/macOS: download the Node.js Linux tarball and compare with native tar.
// On Windows: use a local cross-platform fixture (no POSIX symlinks) since the Linux tarball
// contains symlinks that Windows cannot create, causing 7z to fail with a fatal error.
const TAR_XZ_CONFIG = isWindows
  ? {
      archivePath: path.join(FIXTURES_DIR, 'test-cross-platform.tar.xz'),
      downloadUrl: null as string | null,
      extractedName: 'data',
      nativeExtract: nativeExtractTarXzWindows,
      checkCmd: 'where 7z',
      strip: 1,
    }
  : {
      archivePath: path.join(CACHE_DIR, 'node-v24.12.0-linux-x64.tar.xz'),
      downloadUrl: 'https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-x64.tar.xz' as string | null,
      extractedName: 'node-v24.12.0-linux-x64',
      nativeExtract: nativeExtractTarXzUnix,
      checkCmd: 'which tar && which xz',
      strip: 1,
    };

/**
 * Interface for file stats collected from directory tree
 */
interface FileStats {
  size: number;
  mode: number;
  mtime: number;
  type: 'directory' | 'file' | 'symlink' | 'other';
}

/**
 * Check if a native tool is available
 */
function checkToolAvailable(checkCmd: string, callback: (available: boolean) => void): void {
  execCallback(checkCmd, (err) => {
    callback(!err);
  });
}

/**
 * Collect file stats from a directory tree
 */
function collectStats(dirPath: string, callback: (err: Error | null, stats?: Record<string, FileStats>) => void): void {
  const stats: Record<string, FileStats> = {};

  const iterator = new Iterator(dirPath, { alwaysStat: true, lstat: true });

  iterator.forEach(
    (entry: Entry): void => {
      const entryStats = entry.stats as fs.Stats | undefined;
      if (!entryStats) return;
      stats[entry.path] = {
        size: entryStats.size,
        mode: entryStats.mode,
        mtime: entryStats.mtime instanceof Date ? entryStats.mtime.getTime() : 0,
        type: entryStats.isDirectory() ? 'directory' : entryStats.isFile() ? 'file' : entryStats.isSymbolicLink() ? 'symlink' : 'other',
      };
    },
    { concurrency: 1024 },
    (err) => (err ? callback(err) : callback(null, stats))
  );
}

/**
 * Remove directory if it exists
 */
function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    safeRmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Download file to cache if not present
 */
function ensureCached(fileUrl: string, cachePath: string, callback: (err?: Error | null) => void): void {
  if (fs.existsSync(cachePath)) {
    console.log(`    Using cached: ${path.basename(cachePath)}`);
    callback();
    return;
  }

  console.log(`    Downloading: ${fileUrl}...`);
  getFile(fileUrl, cachePath, (err) => {
    if (err) return callback(err);
    console.log('    Download complete');
    callback();
  });
}

/**
 * Compare two directory trees and report differences
 */
function compareExtractions(nativeDir: string, xzCompatDir: string, callback: (err: Error | null, differences?: string[]) => void): void {
  console.log('    Collecting stats from native extraction...');
  collectStats(nativeDir, (err, statsNative) => {
    if (err) return callback(err);
    if (!statsNative) return callback(new Error('No stats from native dir'));

    console.log('    Collecting stats from xz-compat extraction...');
    collectStats(xzCompatDir, (err, statsXzCompat) => {
      if (err) return callback(err);
      if (!statsXzCompat) return callback(new Error('No stats from xz-compat dir'));

      const differences: string[] = [];

      // Check for files only in native
      for (const filePath in statsNative) {
        if (!(filePath in statsXzCompat)) {
          differences.push(`File exists in native but not in xz-compat: ${filePath}`);
        }
      }

      // Check for files only in xz-compat
      for (const filePath in statsXzCompat) {
        if (!(filePath in statsNative)) {
          differences.push(`File exists in xz-compat but not in native: ${filePath}`);
        }
      }

      // Check for differences in files that exist in both
      for (const filePath in statsNative) {
        if (filePath in statsXzCompat) {
          const statNative = statsNative[filePath];
          const statXzCompat = statsXzCompat[filePath];

          if (statNative.type !== statXzCompat.type) {
            differences.push(`Type mismatch for ${filePath}: native=${statNative.type}, xz-compat=${statXzCompat.type}`);
          }

          if (statNative.size !== statXzCompat.size) {
            differences.push(`Size mismatch for ${filePath}: native=${statNative.size}, xz-compat=${statXzCompat.size}`);
          }

          if (Number(statNative.mode) !== Number(statXzCompat.mode)) {
            differences.push(`Mode mismatch for ${filePath}: native=${Number(statNative.mode).toString(8)}, xz-compat=${Number(statXzCompat.mode).toString(8)}`);
          }
        }
      }

      callback(null, differences);
    });
  });
}

describe('XZ decoder comparison - xz-compat vs native tar', () => {
  const config = TAR_XZ_CONFIG;
  const archivePath = config.archivePath;
  const nativeExtractDir = path.join(TMP_DIR, 'native-tar');
  const xzCompatExtractDir = path.join(TMP_DIR, 'xz-compat');

  let toolAvailable = false;

  before((done) => {
    // Check if native tar and xz are available
    checkToolAvailable(config.checkCmd, (available) => {
      toolAvailable = available;
      if (!available) {
        console.log('    Skipping tar/xz tests - native tar/xz not available');
        done();
        return;
      }

      // Ensure directories exist
      if (!fs.existsSync(CACHE_DIR)) {
        mkdirp.sync(CACHE_DIR);
      }
      if (!fs.existsSync(TMP_DIR)) {
        mkdirp.sync(TMP_DIR);
      }

      // Ensure XZ test data is downloaded
      ensureXZTestData((err) => {
        if (err) return done(err);

        // Download file if needed (skip for local fixture paths)
        const afterDownload = (err?: Error | null) => {
          if (err) return done(err);

          // Clean up previous extractions
          removeDir(nativeExtractDir);
          removeDir(xzCompatExtractDir);

          // Extract with native tool
          console.log(isWindows ? '    Extracting with 7-Zip...' : '    Extracting with native tar...');
          config.nativeExtract(archivePath, TMP_DIR, (err) => {
            if (err) return done(err);

            // Find and rename the extracted directory
            const extractedDir = path.join(TMP_DIR, config.extractedName);
            if (fs.existsSync(extractedDir)) {
              fs.renameSync(extractedDir, nativeExtractDir);
            } else {
              done(new Error(`Native extraction did not create expected directory: ${config.extractedName}`));
              return;
            }

            // Extract with xz-compat + tar-iterator
            console.log('    Extracting with xz-compat + tar-iterator...');
            const readStream = fs.createReadStream(archivePath);
            const xzDecoder = createXZDecoder();

            let dataCount = 0;
            let totalBytes = 0;
            xzDecoder.on('data', (chunk) => {
              dataCount++;
              totalBytes += chunk.length;
              if (dataCount === 1) {
                console.log(`    First XZ output chunk: ${chunk.length} bytes`);
                console.log(`    First 32 bytes (hex): ${chunk.slice(0, 32).toString('hex')}`);
                console.log(`    First 100 chars: ${chunk.slice(0, 100).toString('utf8').replace(/\n/g, '\\n')}`);
              }
              if (dataCount % 100 === 0) {
                console.log(`    XZ output chunks: ${dataCount}, total bytes: ${totalBytes}`);
              }
            });

            xzDecoder.on('error', (err) => {
              console.error('    XZ decoder error:', err);
              done(new Error(`XZ decoder error: ${err.message}`));
            });

            const tarStream = new TarIterator(xzDecoder);

            let entryCount = 0;

            tarStream.forEach(
              (entry, callback) => {
                entry.create(xzCompatExtractDir, {}, callback);
                entryCount++;
                if (entryCount % 500 === 0) {
                  console.log(`      Progress: ${entryCount} entries`);
                }
              },
              { callbacks: true, concurrency: 1 },
              (err) => {
                if (err) return done(new Error(`Tar iterator error: ${err.message}`));
                console.log(`    Both extractions complete (${entryCount} entries)`);
                done();
              }
            );

            // Pipe: tar.xz file -> xz decoder -> tar iterator
            readStream.pipe(xzDecoder);
          });
        };

        if (config.downloadUrl) {
          ensureCached(config.downloadUrl, archivePath, afterDownload);
        } else {
          afterDownload();
        }
      });
    });
  });

  it('should produce identical extraction results', function (done) {
    if (!toolAvailable) {
      this.skip();
      return;
    }

    // tar-iterator preserves the full path including top-level directory,
    // while native tar extracts to that directory (which we rename).
    // So we compare: nativeExtractDir/* vs xzCompatExtractDir/extractedName/*
    const xzCompatSubDir = path.join(xzCompatExtractDir, config.extractedName);

    compareExtractions(nativeExtractDir, xzCompatSubDir, (err, differences) => {
      if (err) return done(err);
      if (!differences) {
        done();
        return;
      }

      if (differences.length > 0) {
        console.error('\n=== DIFFERENCES FOUND (tar.xz) ===');
        for (let i = 0; i < Math.min(differences.length, 20); i++) {
          console.error(differences[i]);
        }
        if (differences.length > 20) {
          console.error(`... and ${differences.length - 20} more differences`);
        }
        console.error('=========================\n');

        done(new Error(`Found ${differences.length} difference(s) in tar.xz extraction`));
        return;
      }

      console.log('    All files match for tar.xz');
      done();
    });
  });

  after(() => {
    // Clean up extraction directories (keep cache)
    removeDir(nativeExtractDir);
    removeDir(xzCompatExtractDir);
  });
});
