import React from 'react';

export default function ClassHeatmap({ chunks = [] }) {
  const getHeatmapColor = (pct) => {
    if (pct === 0) return 'rgba(255, 255, 255, 0.05)';
    if (pct < 20) return 'rgba(245, 158, 11, 0.2)';
    if (pct < 40) return 'rgba(245, 158, 11, 0.5)';
    if (pct < 70) return 'rgba(239, 68, 68, 0.6)';
    return 'rgba(239, 68, 68, 0.9)';
  };

  return (
    <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Lecture Struggle Intensity Heatmap</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))',
        gap: '0.75rem'
      }}>
        {chunks.map((c) => (
          <div 
            key={c.chunk_id} 
            style={{
              padding: '0.75rem',
              borderRadius: 8,
              background: getHeatmapColor(c.struggle_percentage),
              border: '1px solid var(--border-subtle)',
              textAlign: 'center'
            }}
          >
            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Section {c.order}</div>
            <div style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0.25rem 0' }}>
              {c.struggle_percentage}%
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
              {c.struggling_count} struggling
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
