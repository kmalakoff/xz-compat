import assert from 'assert';
import { createLzma2Decoder, createLzmaDecoder, createXZDecoder, decode7zLzma, decode7zLzma2, decodeLzma, decodeLzma2, decodeXZ, isNativeAvailable } from 'xz-compat';

describe('exports .ts', () => {
  it('signature', () => {
    assert.ok(createXZDecoder);
    assert.ok(decodeXZ);
    assert.ok(createLzma2Decoder);
    assert.ok(createLzmaDecoder);
    assert.ok(decodeLzma2);
    assert.ok(decodeLzma);
    assert.ok(decode7zLzma);
    assert.ok(decode7zLzma2);
    assert.ok(isNativeAvailable);
  });
});
