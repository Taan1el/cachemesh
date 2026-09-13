# ADR-001: Doubly Linked List with Hash Map for O(1) LRU Eviction

## Status
Accepted

## Context
High-throughput web applications and caching proxies require bounded memory structures that evict old data when memory capacity is reached. A naive array or ordered map in JavaScript requires $O(N)$ operations to remove arbitrary elements and shift indices, resulting in significant GC pressure and latency spikes during high-concurrency writes.

## Decision
We implemented a textbook $O(1)$ Least Recently Used (LRU) eviction algorithm combining:
1. **JavaScript `Map<string, LRUNode>`**: Provides average $O(1)$ lookup, insertion, and deletion by key.
2. **Doubly Linked List with Sentinel Head and Tail Nodes**: Provides constant-time $O(1)$ node promotion (`moveToHead`), insertion (`addToHead`), and removal (`removeNode`), eliminating null-checking edge cases at boundaries.

## Consequences
### Positive
- `get` and `set` run in constant time regardless of cache size: no scan, no array shift. Measured with `server/scripts/bench.ts` (100,000 operations against a warm 10,000-entry cache), both stayed in the range of roughly 1 to 5 microseconds per operation on the machine this repo was prepared on; run `npm run bench --workspace=server` to measure it on yours.
- True $O(1)$ LRU eviction when capacity is reached, guaranteeing predictable latency.
- Accurate tracking of access timestamps, hits, and byte sizes per node.

### Trade-offs
- Node objects maintain pointer references (`prev`, `next`), adding minor memory overhead per entry compared to flat buffers.
