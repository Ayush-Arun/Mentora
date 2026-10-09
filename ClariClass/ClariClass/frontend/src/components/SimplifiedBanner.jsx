import React, { useState } from 'react';

export default function SimplifiedBanner({ simplifiedText }) {
  const [expanded, setExpanded] = useState(true);

  if (!simplifiedText) return null;

  return (
    <div style={{
      marginTop: '1rem',
      padding: '1rem',
      borderRadius: 8,
      background: 'rgba(99, 102, 241, 0.12)',
      border: '1px solid var(--border-glow)',
      color: 'var(--text-primary)'
    }}>
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        cursor: 'pointer'
      }} onClick={() => setExpanded(!expanded)}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 600, color: '#A5B4FC' }}>
          <span>✨</span>
          <span>Classroom AI Simplification Available</span>
        </div>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
          {expanded ? 'Hide' : 'Show'}
        </span>
      </div>

      {expanded && (
        <div style={{
          marginTop: '0.75rem',
          fontSize: '0.95rem',
          lineHeight: '1.6',
          color: '#E0E7FF',
          whiteSpace: 'pre-wrap'
        }}>
          {simplifiedText}
        </div>
      )}
    </div>
  );
}
