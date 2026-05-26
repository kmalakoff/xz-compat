import assert from 'assert';
import fs from 'fs';
import Iterator, { type Entry } from 'fs-iterator';
import statsSpys from 'fs-stats-spys';
import path from 'path';

import { TARGET } from './constants.ts';

export default function validateFiles(options?: { strip?: boolean }, callback?: (err?: Error | null) => void): void | Promise<void> {
  callback = typeof options === 'function' ? options : callback;
  options = typeof options === 'function' ? { strip: false } : options;

  if (typeof callback === 'function') {
    const dataPath = !options?.strip ? path.join(TARGET, 'data') : TARGET;
    const spys = statsSpys();

    new Iterator(dataPath, { lstat: true }).forEach(
      (entry: Entry): void => {
        const stats = entry.stats as fs.Stats | undefined;
        if (!stats) return;
        spys(stats);
        if (stats.isFile()) {
          const content = fs.readFileSync(entry.fullPath).toString();
          assert.ok(content.length > 0, `File should not be empty: ${entry.fullPath}`);
        }
      },
      (err) => {
        if (err) return callback?.(err);
        callback?.(undefined);
      }
    );
    return;
  }
  return new Promise((resolve, reject) => validateFiles(options, (err?: Error | null) => (err ? reject(err) : resolve())));
}
