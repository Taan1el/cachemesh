// The one place that decides whether the app talks to the real Express API
// or the in-browser demo. Components import from here, never directly from
// ./api.js or ./demoApi.js, so the choice stays in a single spot.
import * as realApi from './api.js';
import * as demoApi from './demoApi.js';

export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true';

const impl = isDemoMode ? demoApi : realApi;

export const fetchWriteAccess = impl.fetchWriteAccess;
export const fetchStats = impl.fetchStats;
export const fetchEntries = impl.fetchEntries;
export const getItem = impl.getItem;
export const setItem = impl.setItem;
export const deleteItem = impl.deleteItem;
export const clearAll = impl.clearAll;
export const purgePattern = impl.purgePattern;
export const runStampedeDemo = impl.runStampedeDemo;
export const updateConfig = impl.updateConfig;
export const fetchOriginEntities = impl.fetchOriginEntities;

export { getApiKey, setApiKey, clearApiKey } from './apiKey.js';

// Only meaningful in demo mode; the real API has no equivalent action a
// browser client can trigger, so the demo banner is the only caller.
export const resetDemoData = demoApi.resetDemoData;
