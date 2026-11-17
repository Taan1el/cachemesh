import { describe, expect, it } from 'vitest';
import { describeRecommendation, hasAssignedTimes, replay, targetPercentText, type Access } from './replay';

describe('recommendation wording', () => {
  const accesses: Access[] = ['a', 'b', 'a', 'b', 'c', 'a', 'b', 'c'].map((key, i) => ({ key, timeMs: (i + 1) * 1000 }));

  it('states the size, hit rate, policy and what doubling adds', () => {
    const report = replay(accesses, { sizes: [2, 3], ttlMs: 60_000, targetHitRate: 0.5 });
    expect(report.recommendation).toMatchObject({ capacity: 3, policy: 'LRU', hitRate: 5 / 8 });
    expect(report.doubled).toMatchObject({ capacity: 6, hitRate: 5 / 8 });
    expect(describeRecommendation(report, 0.5)).toBe('A cache of 3 keys reaches 62.50% hits with LRU, the smallest tested size that meets your 50% target. Doubling it to 6 keys adds nothing on this log.');
  });

  it('reports the points doubling adds', () => {
    const report = replay(accesses, { sizes: [1, 2], ttlMs: 60_000, targetHitRate: 0 });
    expect(report.recommendation).toMatchObject({ capacity: 1 });
    expect(describeRecommendation(report, 0)).toMatch(/Doubling it to 2 keys (adds \d+\.\d points|lowers it by \d+\.\d points|adds nothing)/u);
  });

  it('names the best result when no tested size reaches the target', () => {
    const report = replay(accesses, { sizes: [1, 2], ttlMs: 60_000, targetHitRate: 0.99 });
    expect(describeRecommendation(report, 0.99)).toMatch(/^No tested size reaches your 99% target\. The best result is [\d.]+% hits with (LRU|LFU|TTL) at 2 keys\./u);
  });

  it('detects times that are only one second apart by position', () => {
    expect(hasAssignedTimes(accesses)).toBe(true);
    expect(hasAssignedTimes([{ key: 'a', timeMs: 5 }])).toBe(false);
    expect(hasAssignedTimes([])).toBe(false);
  });
});

describe('target text', () => {
  it('shows a stored fraction as the percent that was typed', () => {
    expect(targetPercentText(0.57)).toBe('57');
    expect(targetPercentText(0.29)).toBe('29');
    expect(targetPercentText(0.8)).toBe('80');
    expect(targetPercentText(0.575)).toBe('57.5');
  });
});
