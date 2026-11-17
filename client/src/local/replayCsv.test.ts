import { describe, expect, it } from 'vitest';
import { parseAccessLog } from './replay';

describe('CSV details', () => {
  it('reports the record number of a bad row even when blank lines come before it', () => {
    expect(() => parseAccessLog('key,timestamp\n\n\nalpha\n', 'csv')).toThrow(/CSV row 4 has 1 fields/u);
  });

  it('accepts header capitalisation and spaces around timestamps', () => {
    expect(parseAccessLog('Key, TimeStamp\r\nalpha, 1000\r\nbeta ,2000\r\n', 'csv')).toEqual([
      { key: 'alpha', timeMs: 1000 }, { key: 'beta ', timeMs: 2000 },
    ]);
  });

  it('rejects a log over the row limit with the limit in the message', () => {
    const big = 'k\n'.repeat(1_000_000);
    expect(() => parseAccessLog(big, 'lines')).toThrow(/at most 100000 rows/u);
    expect(() => parseAccessLog(`key\n${big}`, 'csv')).toThrow(/at most 100000 rows/u);
  });
});
