/**
 * Comparison tests between native tar/xz and xz-compat + tar-iterator
 *
 * These tests download real-world archives (Node.js distributions) and compare
 * the extracted results between system tools and xz-compat + tar-iterator to verify they
 * produce identical output.
 */

import { exec as execCallback } from 'child_process';
import fs from 'fs';
import Iterator from 'fs-iterator';
import { rmSync } from 'fs-remove-compat';
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

// Test configuration for tar.xz
const TAR_XZ_CONFIG = {
  url: 'https://nodejs.org/dist/v24.12.0/node-v24.12.0-linux-x64.tar.xz',
  filename: 'node-v24.12.0-linux-x64.tar.xz',
  extractedName: 'node-v24.12.0-linux-x64',
  nativeCmd: (cachePath: string, tmpDir: string) => `cd "${tmpDir}" && tar -xJf "${cachePath}"`,
  checkCmd: 'which tar && which xz',
  strip: 1,
  skipModeCheck: false,
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
    (entry): void => {
      stats[entry.path] = {
        size: entry.stats.size,
        mode: entry.stats.mode,
        mtime: entry.stats.mtime instanceof Date ? entry.stats.mtime.getTime() : 0,
        type: entry.stats.isDirectory() ? 'directory' : entry.stats.isFile() ? 'file' : entry.stats.isSymbolicLink() ? 'symlink' : 'other',
      };
    },
    { concurrency: 1024 },
    (err) => {
      if (err) {
        callback(err);
      } else {
        callback(null, stats);
      }
    }
  );
}

/**
 * Remove directory if it exists
 */
function removeDir(dirPath: string): void {
  if (fs.existsSync(dirPath)) {
    rmSync(dirPath, { recursive: true, force: true });
  }
}

/**
 * Download file to cache if not present
 */
function ensureCached(fileUrl: string, cachePath: string, callback: (err?: Error) => void): void {
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
function compareExtractions(nativeDir: string, xzCompatDir: string, skipModeCheck: boolean, callback: (err: Error | null, differences?: string[]) => void): void {
  console.log('    Collecting stats from native extraction...');
  collectStats(nativeDir, (err, statsNative) => {
    if (err) return callback(err);

    console.log('    Collecting stats from xz-compat extraction...');
    collectStats(xzCompatDir, (err, statsXzCompat) => {
      if (err) return callback(err);

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

          // Check mode (permissions), but allow for minor differences due to umask
          const modeDiff = Math.abs(statNative.mode - statXzCompat.mode);
          if (!skipModeCheck && modeDiff > 0o22) {
            differences.push(`Mode mismatch for ${filePath}: native=${statNative.mode.toString(8)}, xz-compat=${statXzCompat.mode.toString(8)}`);
          }
        }
      }

      callback(null, differences);
    });
  });
}

describe('XZ decoder comparison - xz-compat vs native tar', () => {
  const config = TAR_XZ_CONFIG;
  const cachePath = path.join(CACHE_DIR, config.filename);
  const nativeExtractDir = path.join(TMP_DIR, 'native-tar');
  const xzCompatExtractDir = path.join(TMP_DIR, 'xz-compat');

  let toolAvailable = false;

  before(function (done) {
    this.timeout(120000);

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
        if (err) {
          done(err);
          return;
        }

        // Download file if needed
        ensureCached(config.url, cachePath, (err) => {
          if (err) {
            done(err);
            return;
          }

          // Clean up previous extractions
          removeDir(nativeExtractDir);
          removeDir(xzCompatExtractDir);

          // Extract with native tar
          console.log('    Extracting with native tar...');
          const nativeCmd = config.nativeCmd(cachePath, TMP_DIR);
          execCallback(nativeCmd, (err) => {
            if (err) {
              done(err);
              return;
            }

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
            const readStream = fs.createReadStream(cachePath);
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
                if (err) {
                  done(new Error(`Tar iterator error: ${err.message}`));
                  return;
                }
                console.log(`    Both extractions complete (${entryCount} entries)`);
                done();
              }
            );

            // Pipe: tar.xz file -> xz decoder -> tar iterator
            readStream.pipe(xzDecoder);
          });
        });
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

    compareExtractions(nativeExtractDir, xzCompatSubDir, config.skipModeCheck, (err, differences) => {
      if (err) {
        done(err);
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
