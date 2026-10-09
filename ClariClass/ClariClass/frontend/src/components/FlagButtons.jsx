import React from 'react';

export default function FlagButtons({ onFlagDifficult, onFlagImportant, isDifficult, isImportant }) {
  return (
    <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.75rem' }}>
      <button
        onClick={onFlagDifficult}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0.8rem',
          borderRadius: 6,
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          border: isDifficult ? '1px solid var(--accent-danger)' : '1px solid var(--border-subtle)',
          background: isDifficult ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.04)',
          color: isDifficult ? '#FCA5A5' : 'var(--text-secondary)'
        }}
      >
        <span>⚠️</span>
        <span>{isDifficult ? 'Flagged Difficult' : 'Difficult'}</span>
      </button>

      <button
        onClick={onFlagImportant}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.4rem',
          padding: '0.4rem 0.8rem',
          borderRadius: 6,
          fontSize: '0.85rem',
          fontWeight: 600,
          cursor: 'pointer',
          border: isImportant ? '1px solid var(--accent-warning)' : '1px solid var(--border-subtle)',
          background: isImportant ? 'rgba(245, 158, 11, 0.2)' : 'rgba(255, 255, 255, 0.04)',
          color: isImportant ? '#FDE68A' : 'var(--text-secondary)'
        }}
      >
        <span>⭐</span>
        <span>{isImportant ? 'Flagged Important' : 'Important'}</span>
      </button>
    </div>
  );
}
