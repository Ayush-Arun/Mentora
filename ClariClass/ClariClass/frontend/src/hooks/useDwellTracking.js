import { useEffect, useRef } from 'react';

export function useDwellTracking(chunkId, onDwellThresholdExceeded, thresholdMs = 45000) {
  const timerRef = useRef(null);

  const startTracking = () => {
    if (!timerRef.current) {
      timerRef.current = setTimeout(() => {
        onDwellThresholdExceeded(chunkId, thresholdMs);
      }, thresholdMs);
    }
  };

  const stopTracking = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return { startTracking, stopTracking };
}
