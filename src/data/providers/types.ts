import type { HealthDataset } from '../../domain/types';

/**
 * The only contract the app depends on. Swap implementations without touching UI,
 * calculations or insights.
 */
export interface HealthDataProvider {
  readonly id: string;
  readonly label: string;
  isConnected(): Promise<boolean>;
  /** Starts the provider's auth flow (may redirect the page). */
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  /** Loads the dataset (history + today) already mapped to the domain model. */
  load(opts?: { days?: number }): Promise<HealthDataset>;
}
