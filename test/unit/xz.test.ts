/**
 * XZ decoder tests
 */

import assert from 'assert';
import { createXZDecoder, decodeXZ } from 'xz-compat';
import { bufferAlloc, bufferFrom } from '../lib/compat.ts';

function expectDecodeFailure(data: Buffer, done: Mocha.Done, matcher?: RegExp): void {
  decodeXZ(data, (err) => {
    if (!err) return done(new Error('Expected decodeXZ to fail'));
    if (matcher && !matcher.test(err.message)) {
      return done(new Error(`Expected "${err.message}" to match ${matcher}`));
    }
    done();
  });
}

describe('XZ decoder', () => {
  describe('decodeXZ', () => {
    it('should reject invalid magic bytes', (done) => {
      const invalidData = bufferFrom('not an xz file');
      expectDecodeFailure(invalidData, done);
    });

    it('should reject too small files', (done) => {
      const smallData = bufferFrom([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00]);
      expectDecodeFailure(smallData, done);
    });

    it('should reject invalid block header size', (done) => {
      // XZ magic + size byte of 0 (index indicator)
      const invalidData = bufferFrom([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00]);
      expectDecodeFailure(invalidData, done);
    });

    it('should reject invalid footer magic', (done) => {
      const invalidData = bufferAlloc(20, 0);
      // Set XZ magic
      invalidData[0] = 0xfd;
      invalidData[1] = 0x37;
      invalidData[2] = 0x7a;
      invalidData[3] = 0x58;
      invalidData[4] = 0x5a;
      invalidData[5] = 0x00;
      // Set invalid footer magic
      invalidData[18] = 0xff;
      invalidData[19] = 0xff;
      expectDecodeFailure(invalidData, done, /Invalid XZ footer magic/);
    });

    it('should reject unsupported filters', (done) => {
      // This is a minimal test - in reality we'd need a real XZ file
      // But we can verify the error is thrown
      const minimalXZ = bufferFrom([0xfd, 0x37, 0x7a, 0x58, 0x5a, 0x00, 0x00, 0x01, 0x59, 0x5a, 0x00, 0x00, 0x08, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
      expectDecodeFailure(minimalXZ, done);
    });
  });

  describe('createXZDecoder', () => {
    it('should create a Transform stream', () => {
      const decoder = createXZDecoder();
      assert.notEqual(decoder, null);
      assert.equal(typeof decoder, 'object');
    });

    it('should have proper stream interface', () => {
      const decoder = createXZDecoder();
      assert.equal(decoder.writable, true);
      assert.equal(decoder.readable, true);
    });

    it('should work with empty input', (done) => {
      const decoder = createXZDecoder();

      decoder.on('error', (_err) => {
        // Expected to error on empty input
        done();
      });

      decoder.on('data', () => {
        done(new Error('Should not emit data for empty input'));
      });

      decoder.end(); // End with no data
    });
  });
});

/**
 * Note: Actual XZ file decompression tests would require:
 * 1. Real XZ test files (not .tar.xz which requires TAR extraction)
 * 2. Known-good decompressed output for verification
 *
 * For now, we test error handling and API surface.
 * Integration tests with real XZ files should be added if this library
 * is used for XZ decompression in production.
 */
