export class HealthEntity {
  /** Always `ok` on success; failures are 503 errors. */
  status: 'ok';

  /** Seconds since the process started. */
  uptimeSeconds: number;

  /** Per-dependency results, on the readiness check. */
  checks?: Record<string, 'up' | 'down'>;
}
