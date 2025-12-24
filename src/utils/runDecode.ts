import once from 'call-once-fn';

export type DecodeCallback<T = Buffer> = (error: Error | null, result?: T) => void;

type DecoderMethods<T> = {
  decompress?: (input: Buffer, signal?: unknown) => unknown;
  decompressSync?: (input: Buffer) => T;
};

const schedule = typeof setImmediate === 'function' ? setImmediate : (fn: () => void) => process.nextTick(fn);

/**
 * Normalize the async contract: callbacks fire once, Promises optional for callers.
 */
export function runDecode<T>(executor: (callback: DecodeCallback<T>) => void, callback?: DecodeCallback<T>): Promise<T> | void {
  callback = once(callback);
  if (typeof callback === 'function') return executor(callback);
  return new Promise<T>((resolve, reject) => executor((err, value) => (err ? reject(err) : resolve(value as T))));
}

/**
 * Execute a synchronous decoder without blocking the current stack frame.
 */
export function runSync<T>(fn: () => T, callback: DecodeCallback<T>): void {
  schedule(() => {
    try {
      callback(null, fn());
    } catch (err) {
      callback(err as Error);
    }
  });
}

/**
 * Try to use native async/sync decoders. Returns true when handling the decode
 * (including scheduling fallback on promise rejection).
 */
export function tryNativeDecode<T>(methods: DecoderMethods<T> | null | undefined, input: Buffer, callback: DecodeCallback<T>, fallback: () => void, expectedSize?: number): boolean {
  if (!methods) return false;

  const matchesExpectedSize = (value: unknown, expectedSize?: number): boolean => {
    if (typeof expectedSize !== 'number' || expectedSize < 0) return true;
    return Buffer.isBuffer(value) ? value.length === expectedSize : true;
  };

  if (typeof methods.decompress === 'function') {
    try {
      const maybePromise = methods.decompress(input);
      if (maybePromise && typeof (maybePromise as Promise<unknown>).then === 'function') {
        (maybePromise as Promise<T>).then(
          (value) => {
            if (!matchesExpectedSize(value, expectedSize)) {
              fallback();
              return;
            }
            callback(null, value);
          },
          () => fallback()
        );
        return true;
      }
    } catch {
      // Ignore promise errors here and fall through to sync/fallback.
    }
  }

  if (typeof methods.decompressSync === 'function') {
    try {
      const value = methods.decompressSync(input);
      if (!matchesExpectedSize(value, expectedSize)) {
        throw new Error('Native decode size mismatch');
      }
      schedule(() => {
        callback(null, value);
      });
      return true;
    } catch {
      // Allow caller to execute fallback
    }
  }

  return false;
}
