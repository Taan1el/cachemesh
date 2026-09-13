// Sample origin data shared by the server's SQLite-backed OriginDatabase and
// the browser demo's in-memory store, so both start from the same catalog.
export interface OriginSeedEntity {
  id: string;
  category: string;
  name: string;
  payload: Record<string, unknown>;
}

export const ORIGIN_SEED_ENTITIES: OriginSeedEntity[] = [
  {
    id: 'user:101',
    category: 'users',
    name: 'Katrin Tamm',
    payload: { role: 'Lead Architect', country: 'Estonia', tier: 'enterprise', activeSessions: 3 },
  },
  {
    id: 'product:pro-mesh',
    category: 'products',
    name: 'CacheMesh Pro Cluster',
    payload: { priceEur: 499, concurrencyLimit: 50000, nodes: 4, sla: '99.99%' },
  },
  {
    id: 'pricing:eu-vat',
    category: 'pricing',
    name: 'EU Standard VAT Matrix',
    payload: { EE: 0.22, DE: 0.19, FI: 0.255, SE: 0.25, currency: 'EUR' },
  },
  {
    id: 'inventory:warehouse-tallinn',
    category: 'inventory',
    name: 'Tallinn Logistics Center Stock',
    payload: { skuCount: 4120, availableUnits: 98400, temperatureControlled: true },
  },
  {
    id: 'config:cluster-routing',
    category: 'config',
    name: 'Global Routing Topology',
    payload: { primaryRegion: 'eu-north-1', failoverRegion: 'eu-central-1', maxRetries: 3 },
  },
];
