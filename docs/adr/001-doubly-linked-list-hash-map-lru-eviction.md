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
- Sub-microsecond execution time for both `get` and `set` operations ($<0.05\text{ms}$).
- True $O(1)$ LRU eviction when capacity is reached, guaranteeing predictable latency.
- Accurate tracking of access timestamps, hits, and byte sizes per node.

### Trade-offs
- Node objects maintain pointer references (`prev`, `next`), adding minor memory overhead per entry compared to flat buffers.
