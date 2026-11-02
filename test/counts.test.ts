import { describe, expect, it } from 'vitest';
import { countNight } from '../src/digest/counts.js';

describe('countNight', () => {
  it('counts the real 2026-10-28 file', () => {
    expect(countNight('runs', '2026-10-28')).toEqual({ ok: 10, retry: 4, fail: 1 });
  });
  it('is null for a missing night', () => {
    expect(countNight('runs', '1999-01-01')).toBeNull();
  });
});
