import React from 'react';

export default function StudentTable({ students = [], onSelectStudent }) {
  return (
    <div className="glass-panel" style={{ padding: '1.5rem' }}>
      <h3 style={{ marginBottom: '1rem', fontSize: '1.1rem' }}>Active Students ({students.length})</h3>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid var(--border-subtle)', color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            <th style={{ padding: '0.75rem' }}>Name</th>
            <th style={{ padding: '0.75rem' }}>Joined At</th>
            <th style={{ padding: '0.75rem' }}>Action</th>
          </tr>
        </thead>
        <tbody>
          {students.map((s) => (
            <tr key={s.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <td style={{ padding: '0.75rem', fontWeight: 600 }}>{s.display_name}</td>
              <td style={{ padding: '0.75rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                {new Date(s.joined_at).toLocaleTimeString()}
              </td>
              <td style={{ padding: '0.75rem' }}>
                <button
                  onClick={() => onSelectStudent && onSelectStudent(s.id)}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    color: '#818CF8',
                    border: '1px solid var(--border-glow)',
                    padding: '0.3rem 0.6rem',
                    borderRadius: 4,
                    cursor: 'pointer',
                    fontSize: '0.8rem'
                  }}
                >
                  View Profile
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
