export type SyncCenterStatus =
  | 'idle'
  | 'running'
  | 'paused'
  | 'failed'
  | 'complete'
  | 'quota-paused';

export function mapRunStatusToSyncCenterStatus(
  status: string | null | undefined,
): SyncCenterStatus {
  switch (status) {
    case 'pending':
    case 'running':
      return 'running';
    case 'killed':
    case 'skipped':
      return 'paused';
    case 'failed':
    case 'quarantined':
      return 'failed';
    case 'success':
    case 'partial':
      return 'complete';
    case 'quota-paused':
    case 'quota-exceeded':
      return 'quota-paused';
    default:
      return 'idle';
  }
}
