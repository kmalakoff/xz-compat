import { bufferFrom, Transform } from 'extract-base-iterator';
import type { Transform as TransformType } from 'stream';

type DecodeFn = (input: Buffer, properties?: Buffer, unpackSize?: number) => Buffer;

/**
 * Helper to create a Transform stream from a synchronous decoder
 *
 * This buffers all input and applies the decoder when the stream ends.
 * This is suitable for codecs that don't support true streaming.
 */
export default function createBufferingDecoder(decodeFn: DecodeFn, properties?: Buffer, unpackSize?: number): InstanceType<typeof TransformType> {
  const chunks: Buffer[] = [];
  let _totalSize = 0;

  return new Transform({
    transform: (chunk: Buffer, _encoding: string, callback: (err?: Error | null, data?: Buffer) => void) => {
      chunks.push(chunk);
      _totalSize += chunk.length;
      callback();
    },
    flush: function (this: InstanceType<typeof TransformType>, callback: (err?: Error | null) => void) {
      try {
        // Concatenate all chunks
        const input = bufferFrom(Buffer.concat(chunks));
        // Decode using the synchronous decoder
        const output = decodeFn(input, properties, unpackSize);
        // Push the result
        this.push(output);
        callback();
      } catch (err) {
        callback(err as Error);
      }
    },
  });
}
