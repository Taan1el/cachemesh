# ADR-003: Frequency-Bucketed LFU and Memory-Bounded Eviction

## Status
Accepted

## Context
While LRU is optimal for recency-biased workloads, it suffers from cache pollution during sequential scans or one-time batch reads. Least Frequently Used (LFU) retains items with high historical access frequency regardless of recent idle periods. Implementing naive LFU with sorting or priority queues incurs $O(\log N)$ or $O(N)$ operations on every access.

## Decision
We implemented a constant-time $O(1)$ LFU algorithm using frequency bucketing:
1. **`Map<number, DoublyLinkedList<LFUNode>>`**: Each distinct frequency integer $f$ maps to a doubly linked list of nodes with access frequency $f$.
2. **`minFrequency` Tracker**: A monotonic pointer tracking the currently lowest non-empty frequency bucket.
3. On every cache access, the node is detached from bucket $f$ and prepended to bucket $f + 1$ in $O(1)$. If bucket $f$ becomes empty and $minFrequency == f$, `minFrequency` advances to $f + 1$.
4. On eviction, the tail node of `minFrequency` is evicted in $O(1)$ time, breaking frequency ties with LRU ordering.

## Consequences
### Positive
- Strict $O(1)$ time complexity for both `get` and `set` operations under LFU.
- Eliminates cache thrashing from one-off burst queries against unpopular keys.
- Supports switching between LRU and LFU at runtime: existing entries transfer to the new policy's structure instead of being dropped.

### Trade-offs
- Requires auxiliary frequency bucket mappings, consuming slightly more heap memory than pure LRU.
