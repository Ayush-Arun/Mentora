import React, { useRef, useEffect } from 'react';
import FlagButtons from './FlagButtons';
import SimplifiedBanner from './SimplifiedBanner';

export default function ChunkCard({ 
  chunk, 
  onSignal, 
  isStruggling,
  simplifiedText 
}) {
  const cardRef = useRef(null);
  const dwellStartTime = useRef(Date.now());

  useEffect(() => {
    // Record dwell time when scrolling away / unmounting
    return () => {
      const elapsed = Date.now() - dwellStartTime.current;
      if (elapsed > 3000) { // only if dwelt for > 3s
        onSignal(chunk.id, 'dwell_ms', elapsed);
      }
    };
  }, [chunk.id, onSignal]);

  return (
    <div 
      ref={cardRef}
      className="glass-panel" 
      style={{
        padding: '1.5rem',
        marginBottom: '1.25rem',
        position: 'relative',
        borderLeft: isStruggling ? '4px solid var(--accent-danger)' : '4px solid transparent',
        transition: 'all 0.2s ease'
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '0.5rem' }}>
        <span>Section #{chunk.order}</span>
        <span>Page / Slide {chunk.page_number}</span>
      </div>

      <p style={{ fontSize: '1.05rem', lineHeight: '1.7', color: 'var(--text-primary)' }}>
        {chunk.text}
      </p>

      <FlagButtons
        onFlagDifficult={() => onSignal(chunk.id, 'flag_difficult', 1.0)}
        onFlagImportant={() => onSignal(chunk.id, 'flag_important', 1.0)}
        isDifficult={isStruggling}
        isImportant={false}
      />

      <SimplifiedBanner simplifiedText={simplifiedText || chunk.simplified_text} />
    </div>
  );
}
