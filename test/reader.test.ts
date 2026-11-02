import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/reader.js';
import type { DigestRow, Night } from '../src/digest/types.js';

function tempRuns(files: Record<string, string>): string {
  const dir = mkdtempSync(join(tmpdir(), 'rig-reader-'));
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  return dir;
}

function mustRead(runsDir: string, night: string): Night {
  const n = readNight(runsDir, night);
  if (n === null) throw new Error(`no night ${night}`);
  return n;
}

function row(n: Night, job: string): DigestRow {
  const r = n.rows.find((x) => x.job === job);
  if (r === undefined) throw new Error(`no row ${job}`);
  return r;
}

describe('readNight on runs/2026-10-28.jsonl', () => {
  const n = mustRead('runs', '2026-10-28');

  it('reads 5 jobs and counts the truncated last line as bad', () => {
    expect(n.night).toBe('2026-10-28');
    expect(n.rows).toHaveLength(5);
    expect(n.badLines).toBe(1);
  });

  it('sorts rows by job', () => {
    const jobs = n.rows.map((r) => r.job);
    expect(jobs).toEqual([...jobs].sort());
    expect(jobs).toEqual(['digest/render', 'fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
  });

  it('summarises fixtures/refresh', () => {
    expect(row(n, 'fixtures/refresh')).toEqual({
      job: 'fixtures/refresh',
      owner: 'rook',
      runs: 4,
      retries: 3,
      lastStatus: 'ok',
      lastError: 'upstream 503',
      firstAt: '2026-10-29T01:30:00+01:00',
      lastAt: '2026-10-29T01:37:00+01:00',
    });
  });

  it('keeps the failure on notes/backup', () => {
    const r = row(n, 'notes/backup');
    expect(r.lastStatus).toBe('fail');
    expect(r.lastError).toBe('quota exceeded');
  });

  it('keeps a row whose owner is null', () => {
    expect(row(n, 'digest/render').owner).toBeNull();
  });

  it('counts lane/sync retries', () => {
    expect(row(n, 'lane/sync').retries).toBe(1);
  });

  it('keeps the log offset on times', () => {
    expect(row(n, 'rig/rotate-logs').firstAt).toBe('2026-10-28T23:00:02+01:00');
    for (const r of n.rows) {
      expect(r.firstAt).toMatch(/\+01:00$/);
      expect(r.lastAt).toMatch(/\+01:00$/);
    }
  });
});

describe('readNight edges', () => {
  it('returns null for a night with no file', () => {
    expect(readNight(tempRuns({}), '2026-01-01')).toBeNull();
  });

  it('returns an empty night for an empty or blank file', () => {
    const dir = tempRuns({ '2026-01-01.jsonl': '', '2026-01-02.jsonl': '\n  \n\n' });
    expect(readNight(dir, '2026-01-01')).toEqual({ night: '2026-01-01', rows: [], badLines: 0 });
    expect(readNight(dir, '2026-01-02')).toEqual({ night: '2026-01-02', rows: [], badLines: 0 });
  });

  it('returns null for a night that is not YYYY-MM-DD', () => {
    const dir = tempRuns({ 'x.jsonl': '' });
    for (const bad of ['x', '../runs/2026-10-28', '2026-10-28/../x', '2026-1-1', '']) {
      expect(readNight(dir, bad)).toBeNull();
    }
  });

  it('counts lines that are JSON but not a run line as bad', () => {
    const lines = [
      '{"at":"2026-01-01T00:00:00+01:00","job":"a","status":"ok","owner":"x"}',
      '{"at":"2026-01-01T00:00:01+01:00","job":"a","status":"weird","owner":"x"}',
      '{"at":"2026-01-01T00:00:02+01:00","job":"a","status":"ok","owner":7}',
      '{"at":"2026-01-01T00:00:03+01:00","job":"a","status":"ok","owner":"x","error":5}',
      '{"job":"a","status":"ok","owner":"x"}',
      '[1,2]',
      'null',
      'not json',
      '',
    ];
    const n = mustRead(tempRuns({ '2026-01-01.jsonl': lines.join('\n') }), '2026-01-01');
    expect(n.badLines).toBe(7);
    expect(n.rows).toHaveLength(1);
    expect(row(n, 'a').runs).toBe(1);
  });

  it('takes the owner from the latest line and the error from the latest line that had one', () => {
    const lines = [
      '{"at":"t1","job":"a","status":"retry","owner":"x","error":"first"}',
      '{"at":"t2","job":"a","status":"retry","owner":"y","error":"second"}',
      '{"at":"t3","job":"a","status":"ok","owner":null}',
    ];
    const n = mustRead(tempRuns({ '2026-01-01.jsonl': lines.join('\n') + '\n' }), '2026-01-01');
    expect(row(n, 'a')).toMatchObject({ owner: null, lastError: 'second', lastStatus: 'ok', firstAt: 't1', lastAt: 't3', retries: 2, runs: 3 });
  });
});
