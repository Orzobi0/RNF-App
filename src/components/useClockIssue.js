import { useEffect, useState } from 'react';

// Visual state only: never changes the session or persisted clock observations.
export function useClockIssue(sessionState, history) {
  const { clockResult: result, clockError: error } = sessionState;
  const deviceKey = sessionState.visualScenario ?? sessionState.deviceKey;
  const verified = !error && Number.isFinite(result?.driftSeconds)
    && Math.abs(result.driftSeconds) <= 120 && !result.phoneZoneChanged
    && (result.operation === 'read' || result.verified === true);
  const historyError = history?.lastCheck?.errorCode;
  const known = Boolean(error || result?.significantDrift || history?.state === 'misaligned'
    || (historyError && historyError !== 'CLOCK_PENDING')
    || (history?.state === 'unknown' && Math.abs(history?.lastValidCheck?.driftSeconds) > 120));
  const [retained, setRetained] = useState({ deviceKey, issue: false });
  const issue = !verified && (known || (retained.deviceKey === deviceKey && retained.issue));
  useEffect(() => { setRetained({ deviceKey, issue }); }, [deviceKey, issue]);
  return { issue, verified };
}
