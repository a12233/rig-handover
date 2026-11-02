import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseLine } from './reader.js';

export type NightCounts = { ok: number; retry: number; fail: number };

// Parsed run lines per status; null when the night has no file.
export function countNight(runsDir: string, night: string): NightCounts | null {
  const file = join(runsDir, `${night}.jsonl`);
  if (!existsSync(file)) return null;
  const counts: NightCounts = { ok: 0, retry: 0, fail: 0 };
  for (const raw of readFileSync(file, 'utf8').split(/\r?\n/)) {
    if (raw.trim() === '') continue;
    const line = parseLine(raw);
    if (line !== null) counts[line.status]++;
  }
  return counts;
}
