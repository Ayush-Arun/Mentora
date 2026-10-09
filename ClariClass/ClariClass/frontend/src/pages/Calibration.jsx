import React, { useState } from 'react';

export default function Calibration({ onComplete }) {
  const [pointIndex, setPointIndex] = useState(0);
  const points = [
    { top: '15%', left: '15%' },
    { top: '15%', left: '85%' },
    { top: '50%', left: '50%' },
    { top: '85%', left: '15%' },
    { top: '85%', left: '85%' }
  ];

  const handleClickPoint = () => {
    if (pointIndex + 1 < points.length) {
      setPointIndex(pointIndex + 1);
    } else {
      onComplete();
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(11, 15, 23, 0.95)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 100
    }}>
      <div style={{ textAlign: 'center', maxWidth: 500, marginBottom: '2rem' }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700, marginBottom: '0.5rem' }}>Gaze Calibration</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>
          Click each red calibration dot while looking directly at it to tune on-device gaze tracking.
        </p>
      </div>

      <button
        onClick={handleClickPoint}
        style={{
          position: 'absolute',
          top: points[pointIndex].top,
          left: points[pointIndex].left,
          transform: 'translate(-50%, -50%)',
          width: 32,
          height: 32,
          borderRadius: '50%',
          background: 'var(--accent-danger)',
          border: '3px solid #fff',
          cursor: 'pointer',
          boxShadow: '0 0 20px rgba(239, 68, 68, 0.8)',
          animation: 'pulse 1.5s infinite'
        }}
      />
    </div>
  );
}
