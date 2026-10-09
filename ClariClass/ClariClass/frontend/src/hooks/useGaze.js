import { useState, useEffect } from 'react';

export function useGaze({ enabled = false, onGazeUpdate } = {}) {
  const [isReady, setIsReady] = useState(false);
  const [isCalibrated, setIsCalibrated] = useState(false);

  useEffect(() => {
    if (!enabled) return;

    // WebGazer initialization stub / hook
    console.log('[GazeTracking] Initializing WebGazer client-side hook...');
    setIsReady(true);

    return () => {
      // Cleanup WebGazer instance
    };
  }, [enabled]);

  return { isReady, isCalibrated, setIsCalibrated };
}
