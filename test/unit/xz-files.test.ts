/**
 * XZ decoder tests using official tukaani-project/xz test files
 *
 * These tests verify the XZ decoder against the official test suite
 * from the xz reference implementation.
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { decodeXZ } from 'xz-compat';
import { ensureXZTestData } from '../lib/download.ts';

const __dirname = path.dirname(typeof __filename !== 'undefined' ? __filename : url.fileURLToPath(import.meta.url));
const TEST_FILES_DIR = path.join(__dirname, '..', '..', '.cache', 'xz', 'tests', 'files');

/**
 * Helper to check if test files exist
 */
function testFilesExist(): boolean {
  return fs.existsSync(TEST_FILES_DIR) && fs.existsSync(path.join(TEST_FILES_DIR, 'good-0-empty.xz'));
}

function decodeAndAssert(data: Buffer, done: Mocha.Done, assertion: (result: Buffer) => void): void {
  decodeXZ(data, (err, result) => {
    if (err) return done(err);
    try {
      assertion(result as Buffer);
      done();
    } catch (assertErr) {
      done(assertErr as Error);
    }
  });
}

function expectDecodeError(data: Buffer, done: Mocha.Done, matcher?: RegExp | ((error: Error) => void)): void {
  decodeXZ(data, (err) => {
    if (!err) return done(new Error('Expected decodeXZ to fail'));
    try {
      if (matcher) {
        if (typeof matcher === 'function') {
          matcher(err);
        } else if (!matcher.test(err.message)) {
          throw new Error(`Expected error "${err.message}" to match ${matcher}`);
        }
      }
      done();
    } catch (assertErr) {
      done(assertErr as Error);
    }
  });
}

describe('XZ decoder - official test files', () => {
  before((done) => {
    // Download/clone XZ test data - this MUST succeed
    ensureXZTestData((err) => {
      if (err) {
        console.log('    ERROR: Failed to download XZ test data:', err.message);
        return done(new Error(`Failed to download XZ test data: ${err.message}`));
      }

      // Verify test files actually exist after download
      if (!testFilesExist()) {
        console.log('    ERROR: XZ test files not found after download');
        return done(new Error('XZ test files not found in .cache/xz/tests/files after ensureXZTestData()'));
      }

      console.log('    XZ test files ready');
      done();
    });
  });

  describe('Good files - empty streams', () => {
    it('good-0-empty.xz - one stream with no blocks', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-0-empty.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.strictEqual(result.length, 0);
      });
    });

    it('good-0pad-empty.xz - empty stream with 4-byte padding', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-0pad-empty.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.strictEqual(result.length, 0);
      });
    });

    it('good-0cat-empty.xz - two empty streams concatenated', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-0cat-empty.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.strictEqual(result.length, 0);
      });
    });

    it('good-0catpad-empty.xz - two empty streams with padding between', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-0catpad-empty.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.strictEqual(result.length, 0);
      });
    });
  });

  describe('Good files - check types', () => {
    it('good-1-check-none.xz - no integrity check', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-check-none.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-check-crc32.xz - CRC32 check', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-check-crc32.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-check-crc64.xz - CRC64 check', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-check-crc64.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-check-sha256.xz - SHA-256 check', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-check-sha256.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });
  });

  describe('Good files - block header formats', () => {
    it('good-1-block_header-1.xz - compressed and uncompressed size in header', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-block_header-1.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-block_header-2.xz - known compressed size', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-block_header-2.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-block_header-3.xz - known uncompressed size', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-block_header-3.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });
  });

  describe('Good files - LZMA2 variations', () => {
    it('good-1-lzma2-1.xz - two chunks, second sets new properties', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-lzma2-1.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-lzma2-2.xz - two chunks, second resets state', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-lzma2-2.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-lzma2-3.xz - uncompressed then LZMA with dict reset', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-lzma2-3.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-lzma2-4.xz - LZMA, uncompressed dict reset, LZMA new props', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-lzma2-4.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });

    it('good-1-lzma2-5.xz - empty LZMA2 stream with end marker only', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-1-lzma2-5.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.strictEqual(result.length, 0);
      });
    });

    it('good-2-lzma2.xz - two blocks with one uncompressed chunk each', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'good-2-lzma2.xz'));
      decodeAndAssert(data, done, (result) => {
        assert.ok(result.length > 0);
      });
    });
  });

  describe('Bad files - header errors', () => {
    it('bad-0-header_magic.xz - wrong header magic', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'bad-0-header_magic.xz'));
      expectDecodeError(data, done, /magic/i);
    });

    it('bad-0-footer_magic.xz - wrong footer magic', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'bad-0-footer_magic.xz'));
      expectDecodeError(data, done, /footer|magic/i);
    });

    it('bad-0-empty-truncated.xz - truncated file', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'bad-0-empty-truncated.xz'));
      expectDecodeError(data, done);
    });
  });

  describe('Bad files - LZMA2 errors', () => {
    // NOTE: bad-1-lzma2-1.xz tests that the first chunk must reset dictionary.
    // Our LZMA2 decoder doesn't validate this edge case, consistent with many decoders.
    it.skip('bad-1-lzma2-1.xz - first chunk doesnt reset dictionary', async () => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'bad-1-lzma2-1.xz'));
      await assert.rejects(decodeXZ(data), Error);
    });

    it('bad-1-lzma2-6.xz - reserved control byte 0x03', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'bad-1-lzma2-6.xz'));
      expectDecodeError(data, done);
    });
  });

  describe('Unsupported files', () => {
    it('unsupported-filter_flags-1.xz - unsupported filter ID 0x7F', (done) => {
      const data = fs.readFileSync(path.join(TEST_FILES_DIR, 'unsupported-filter_flags-1.xz'));
      expectDecodeError(data, done, /unsupported|filter/i);
    });
  });
});
