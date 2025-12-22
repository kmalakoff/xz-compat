import assert from 'assert';
import { createLzma2Decoder, createLzmaDecoder, createXZDecoder, decodeLzma, decodeLzma2, decodeXZ, detectLzmaFormat } from 'xz-compat';

describe('exports .ts', () => {
  it('signature', () => {
    assert.ok(createXZDecoder);
    assert.ok(decodeXZ);
    assert.ok(createLzmaDecoder);
    assert.ok(createLzma2Decoder);
    assert.ok(decodeLzma);
    assert.ok(decodeLzma2);
    assert.ok(detectLzmaFormat);
  });
});
