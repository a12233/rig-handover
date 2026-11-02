import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import type { Night } from '../src/digest/types.js';

const base = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60 };
const GOOD = '2026-01-01';
const EMPTY = '2026-01-02';
const BAD = '2026-01-03';
const MISSING = '2026-01-04';

const l = (o: object) => JSON.stringify(o);
const good = [
  l({ at: '2026-01-01T01:00:00+01:00', job: 'zeta', status: 'ok', owner: 'ana' }),
  l({ at: '2026-01-01T01:05:00+01:00', job: 'alpha', status: 'retry', owner: null }),
  l({ at: '2026-01-01T01:06:00+01:00', job: 'alpha', status: 'retry', owner: null }),
  l({ at: '2026-01-01T01:07:00+01:00', job: 'alpha', status: 'retry', owner: null }),
  l({ at: '2026-01-01T01:08:00+01:00', job: 'alpha', status: 'ok', owner: null }),
  l({ at: '2026-01-01T02:00:00+01:00', job: 'mid', status: 'fail', owner: 'bo', error: 'boom' }),
].join('\n') + '\n';
const bad = [
  l({ at: '2026-01-03T01:00:00+01:00', job: 'one', status: 'ok', owner: 'ana' }),
  l({ at: '2026-01-03T01:01:00+01:00', job: 'two', status: 'ok', owner: 'bo' }),
  '{"at": "2026-01-03T01:02',
].join('\n') + '\n';

let dir: string;
let app: ReturnType<typeof createApp>;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rig-'));
  fs.writeFileSync(path.join(dir, `${GOOD}.jsonl`), good);
  fs.writeFileSync(path.join(dir, `${EMPTY}.jsonl`), '');
  fs.writeFileSync(path.join(dir, `${BAD}.jsonl`), bad);
  app = createApp({ ...base, runsDir: dir });
});

afterAll(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('GET /digest/:night', () => {
  it('renders the good night', async () => {
    const res = await app.request(`/digest/${GOOD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    for (const j of ['alpha', 'mid', 'zeta']) expect(html).toContain(j);
    expect(html).toContain('—');
    expect(html).toMatch(/<tr class="warn"><td>alpha<\/td>/);
    expect(html).toMatch(/<tr class="warn"><td>mid<\/td>/);
    expect(html).not.toMatch(/<tr class="warn"><td>zeta<\/td>/);
  });

  it('404s for a night with no file', async () => {
    const res = await app.request(`/digest/${MISSING}`);
    expect(res.status).toBe(404);
  });

  it('says nothing ran for the empty night', async () => {
    const res = await app.request(`/digest/${EMPTY}`);
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('renders valid rows and reports the bad line', async () => {
    const res = await app.request(`/digest/${BAD}`);
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('one');
    expect(html).toContain('two');
    expect(html).toContain('1 line did not parse');
  });
});

describe('GET /api/digest/:night', () => {
  it('returns the good night sorted by job', async () => {
    const res = await app.request(`/api/digest/${GOOD}`);
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows.map((r) => r.job)).toEqual(['alpha', 'mid', 'zeta']);
    expect(body.badLines).toBe(0);
  });

  it('404s with an error body', async () => {
    const res = await app.request(`/api/digest/${MISSING}`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no run log', night: MISSING });
  });

  it('returns no rows for the empty night', async () => {
    const res = await app.request(`/api/digest/${EMPTY}`);
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows).toEqual([]);
    expect(body.badLines).toBe(0);
  });

  it('counts the bad line', async () => {
    const res = await app.request(`/api/digest/${BAD}`);
    const body = (await res.json()) as Night;
    expect(res.status).toBe(200);
    expect(body.rows).toHaveLength(2);
    expect(body.badLines).toBe(1);
  });
});

describe('page and JSON agree', () => {
  it('lists the same jobs in the same order', async () => {
    const html = await (await app.request(`/digest/${GOOD}`)).text();
    const body = (await (await app.request(`/api/digest/${GOOD}`)).json()) as Night;
    const fromHtml = [...html.matchAll(/<tr[^>]*><td>([^<]+)<\/td>/g)].map((m) => m[1]);
    expect(fromHtml).toEqual(body.rows.map((r) => r.job));
  });
});
