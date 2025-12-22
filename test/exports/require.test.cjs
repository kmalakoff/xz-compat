const assert = require('assert');
const XZ = require('xz-compat');

describe('exports .cjs', () => {
  it('signature', () => {
    assert.ok(XZ.createXZDecoder);
    assert.ok(XZ.decodeXZ);
    assert.ok(XZ.createLzmaDecoder);
    assert.ok(XZ.createLzma2Decoder);
    assert.ok(XZ.decodeLzma);
    assert.ok(XZ.decodeLzma2);
    assert.ok(XZ.detectLzmaFormat);
  });
});
