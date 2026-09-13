# ADR-002: Singleflight Promise Coalescing to Eliminate Cache Stampedes

## Status
Accepted

## Context
When a high-frequency cache entry expires or experiences a cold start under heavy traffic, dozens or hundreds of concurrent requests arrive simultaneously for the exact same key (the "Thundering Herd" or "Cache Stampede" problem). Without protection, all concurrent requests miss the cache and independently query the origin database, overwhelming database connection pools and causing cascading outages.

## Decision
We implemented the Singleflight request coalescing pattern (inspired by Go's `golang.org/x/sync/singleflight`):
- Maintain an in-flight Promise map `Map<string, Promise<T>>`.
- When a request misses the cache, check if a promise for the key is already resolving.
- If in-flight, return the existing Promise without invoking the origin database.
- If not in-flight, trigger the origin fetch, register the Promise, and delete the key from the registry upon resolution or rejection.

## Consequences
### Positive
- N concurrent callers for the same cold key produce exactly 1 origin call instead of N; the other N-1 receive the same result once it resolves, without querying the origin themselves. Covered by the singleflight tests in `server/test` and reproducible live with the stampede simulator in the UI.
- Coalesced requests receive identical results with zero redundant disk or network I/O.
- Self-cleaning: registry cleans up synchronously in a `finally` block even when queries throw errors.

### Trade-offs
- If the single in-flight origin request fails, all coalesced callers receive the same rejection error.
