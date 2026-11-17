import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseAccessLog, replay } from './replay';

describe('Redis MONITOR input', () => {
  const sample = readFileSync(resolve('src/local/fixtures/monitor.txt'), 'utf8');

  it('takes the key from read commands only and converts seconds to milliseconds', () => {
    expect(parseAccessLog(sample, 'monitor')).toEqual([
      { key: 'user:1', timeMs: 1_700_000_000_123 },
      { key: 'user:2', timeMs: 1_700_000_001_000 },
      { key: 'session:9', timeMs: 1_700_000_001_500 },
      { key: 'session:9', timeMs: 1_700_000_002_000 },
      { key: 'user:1', timeMs: 1_700_000_002_750 },
      { key: 'café "quoted" \ end', timeMs: 1_700_000_003_100 },
      { key: 'user:1', timeMs: 1_700_000_005_000 },
    ]);
  });

  it('handles CRLF and a byte order mark', () => {
    expect(parseAccessLog('\uFEFFOK\r\n1700000000.5 [0 127.0.0.1:6379] "get" "a"\r\n', 'monitor')).toEqual([{ key: 'a', timeMs: 1_700_000_000_500 }]);
  });

  it('says what it expected when no read command is found', () => {
    expect(() => parseAccessLog('OK\n1700000000.1 [0 127.0.0.1:6379] "set" "a" "1"\n', 'monitor')).toThrow(/No GET, MGET, HGET, HGETALL or EXISTS commands/u);
  });

  it('rejects a read command with an unterminated argument and reversed time', () => {
    expect(() => parseAccessLog('1700000000.1 [0 127.0.0.1:6379] "get" "a', 'monitor')).toThrow(/line 1.*unterminated/u);
    expect(() => parseAccessLog('1700000002.0 [0 x] "get" "a"\n1700000001.0 [0 x] "get" "b"', 'monitor')).toThrow(/nondecreasing/u);
  });

  it('replays the fixture through the policies', () => {
    const report = replay(parseAccessLog(sample, 'monitor'), { sizes: [2], ttlMs: 60_000, targetHitRate: 0 });
    expect(report.rows.find((row) => row.policy === 'LRU')).toMatchObject({ hits: 2, misses: 5 });
  });
});
