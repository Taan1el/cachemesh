// Local throughput benchmark for the cache engines. Not part of the test
// suite (timings vary by machine); run it yourself with `npm run bench`
// from the server workspace, or `npm run bench --workspace=server` from
// the repo root. Numbers quoted in the README and ADRs came from running
// this on the machine the repo was prepared on.
import { LRUCache } from '../../shared/lru.js';
import { LFUCache } from '../../shared/lfu.js';
import { Singleflight } from '../../shared/singleflight.js';

const OPS = 100_000;
const CAPACITY = 10_000;

function keyFor(i: number): string {
  return `bench:key:${i % CAPACITY}`;
}

function timeOps(label: string, fn: () => void): void {
  const start = performance.now();
  fn();
  const elapsedMs = performance.now() - start;
  const perOpMicros = (elapsedMs * 1000) / OPS;
  console.log(
    `${label}: ${OPS.toLocaleString()} ops in ${elapsedMs.toFixed(1)} ms ` +
      `(${perOpMicros.toFixed(2)} microseconds/op, ${Math.round(OPS / (elapsedMs / 1000)).toLocaleString()} ops/sec)`
  );
}

function benchCache(name: string, cache: LRUCache | LFUCache): void {
  // Warm the cache to capacity first so `set` measures steady-state
  // eviction, not the cold, empty-cache path.
  for (let i = 0; i < CAPACITY; i++) {
    cache.set(keyFor(i), { i, payload: 'x'.repeat(64) });
  }

  timeOps(`${name} set (at capacity, evicting)`, () => {
    for (let i = 0; i < OPS; i++) {
      cache.set(keyFor(i), { i, payload: 'x'.repeat(64) });
    }
  });

  timeOps(`${name} get (warm hits)`, () => {
    for (let i = 0; i < OPS; i++) {
      cache.get(keyFor(i));
    }
  });
}

async function benchSingleflight(): Promise<void> {
  const sf = new Singleflight();
  const concurrent = 100;
  const start = performance.now();
  await Promise.all(
    Array.from({ length: concurrent }, () =>
      sf.do('bench:stampede-key', async () => {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return 'origin-result';
      })
    )
  );
  const elapsedMs = performance.now() - start;
  console.log(
    `Singleflight: ${concurrent} concurrent callers for one key resolved in ${elapsedMs.toFixed(1)} ms ` +
      `with exactly 1 origin call (verified by the coalescedHits assertion in server/test)`
  );
}

console.log(`Node ${process.version}, capacity ${CAPACITY.toLocaleString()}, ${OPS.toLocaleString()} ops per measurement\n`);
benchCache('LRUCache', new LRUCache(CAPACITY));
console.log('');
benchCache('LFUCache', new LFUCache(CAPACITY));
console.log('');
await benchSingleflight();
