export interface SingleflightResult<T> {
  value: T;
  coalesced: boolean;
}

export class Singleflight {
  private inFlight = new Map<string, Promise<unknown>>();
  private originCallCounts = new Map<string, number>();

  /**
   * Executes and returns the results of the given function, making
   * sure that only one execution is in-flight for a given key at a
   * time. If a duplicate comes in, the duplicate caller waits for the
   * original to complete and receives the same result.
   */
  public async do<T>(key: string, fn: () => Promise<T>): Promise<SingleflightResult<T>> {
    const existing = this.inFlight.get(key);
    if (existing) {
      const value = (await existing) as T;
      return { value, coalesced: true };
    }

    const promise = (async () => {
      this.originCallCounts.set(key, (this.originCallCounts.get(key) || 0) + 1);
      try {
        return await fn();
      } finally {
        this.inFlight.delete(key);
      }
    })();

    this.inFlight.set(key, promise);
    const value = (await promise) as T;
    return { value, coalesced: false };
  }

  public getOriginCalls(key: string): number {
    return this.originCallCounts.get(key) || 0;
  }

  public resetCounts(): void {
    this.originCallCounts.clear();
  }

  public activeInFlightCount(): number {
    return this.inFlight.size;
  }
}
