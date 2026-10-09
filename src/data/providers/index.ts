import type { HealthDataProvider } from './types';
import { MockProvider } from './mockProvider';
import { GoogleHealthProvider } from './googleHealthProvider';

/**
 * Provider selection. Default is sample data so the app runs with zero setup.
 * Set VITE_DATA_PROVIDER=google (and run the backend in /server) to use real data.
 */
export function createProvider(): HealthDataProvider {
  const which = (import.meta as any).env?.VITE_DATA_PROVIDER ?? 'sample';
  return which === 'google' ? new GoogleHealthProvider() : new MockProvider();
}

export type { HealthDataProvider };
