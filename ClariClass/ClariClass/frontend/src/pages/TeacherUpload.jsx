import React, { useState } from 'react';
import { apiRequest } from '../api/client';
import { UploadCloud, GraduationCap, ArrowLeft, BookOpen, Sparkles } from 'lucide-react';

export default function TeacherUpload({ onSessionCreated, onBack }) {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState("Physics 101 — Newton's Laws");
  const [threshold, setThreshold] = useState(25);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const PRESET_TOPICS = [
    {
      title: "Physics 101 — Newton's Laws",
      desc: "3 slides: Inertia, F=ma, Action-Reaction"
    },
    {
      title: "CS 301 — Distributed Systems & Paxos",
      desc: "3 slides: Consensus, Leader Election, Quorums"
    },
    {
      title: "Bio 201 — Cellular Respiration & ATP",
      desc: "3 slides: Glycolysis, Krebs Cycle, Electron Transport"
    }
  ];

  const handleUploadAndCreate = async (e) => {
    e?.preventDefault();
    setLoading(true);
    setError('');

    try {
      let docId = 1;

      if (file) {
        const formData = new FormData();
        formData.append('file', file);
        if (title) formData.append('title', title);

        const docRes = await apiRequest('/documents/upload', {
          method: 'POST',
          body: formData
        });
        docId = docRes.document_id;
      }

      // Create session in backend
      const sessionRes = await apiRequest('/sessions/create', {
        method: 'POST',
        body: JSON.stringify({
          document_id: docId,
          struggle_threshold_percent: parseFloat(threshold)
        })
      });

      onSessionCreated({
        ...sessionRes,
        title: title || "Classroom Lecture"
      });
    } catch (err) {
      console.log('Using local session coordinator:', err);
      // Fallback local session
      onSessionCreated({
        room_code: 'ROOM' + Math.floor(100 + Math.random() * 900),
        title: title,
        document_id: 1,
        struggle_threshold_percent: threshold
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: '#EDF9F2',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1rem'
    }}>
      {/* Brand Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '1.5rem' }}>
        <div style={{
          width: 40,
          height: 40,
          borderRadius: 10,
          backgroundColor: '#0A4D3C',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#FFFFFF'
        }}>
          <GraduationCap size={24} />
        </div>
        <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0A4D3C', letterSpacing: '-0.03em' }}>
          FocusAI<span style={{ color: '#0A4D3C' }}>.</span>
        </span>
      </div>

      {/* Main Upload Card */}
      <div style={{
        width: '100%',
        maxWidth: 540,
        backgroundColor: '#FFFFFF',
        borderRadius: 20,
        padding: '2rem 2rem',
        boxShadow: '0 10px 30px rgba(0, 0, 0, 0.05)',
        border: '1px solid rgba(0, 0, 0, 0.04)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: '#111827' }}>
            Start Live Classroom Session
          </h2>
          {onBack && (
            <button
              onClick={onBack}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem',
                border: 'none',
                backgroundColor: 'transparent',
                color: '#6B7280',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer'
              }}
            >
              <ArrowLeft size={14} /> Back
            </button>
          )}
        </div>

        <p style={{ fontSize: '0.88rem', color: '#6B7280', marginBottom: '1.5rem', lineHeight: '1.4' }}>
          Upload slides (PDF/PPTX) or select a course topic to generate real-time adaptive learning chunks.
        </p>

        {error && (
          <div style={{
            padding: '0.75rem 1rem',
            backgroundColor: '#FEE2E2',
            color: '#DC2626',
            borderRadius: 10,
            fontSize: '0.85rem',
            marginBottom: '1.25rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleUploadAndCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          
          {/* Quick Preset Topics */}
          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              COURSE TOPIC PRESETS
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem' }}>
              {PRESET_TOPICS.map((pt, i) => (
                <div
                  key={i}
                  onClick={() => setTitle(pt.title)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.65rem 0.85rem',
                    borderRadius: 10,
                    border: title === pt.title ? '1.5px solid #0A4D3C' : '1px solid #E5E7EB',
                    backgroundColor: title === pt.title ? '#E8F7EE' : '#F9FAFB',
                    cursor: 'pointer'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                    <BookOpen size={16} color={title === pt.title ? '#0A4D3C' : '#6B7280'} />
                    <div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: title === pt.title ? '#0A4D3C' : '#111827' }}>
                        {pt.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: '#9CA3AF' }}>{pt.desc}</div>
                    </div>
                  </div>
                  {title === pt.title && (
                    <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#0A4D3C' }}>SELECTED</span>
                  )}
                </div>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', marginBottom: '0.4rem', textTransform: 'uppercase' }}>
              OR UPLOAD CUSTOM PDF / PPTX
            </label>
            <div style={{
              border: '2px dashed #D1D5DB',
              borderRadius: 12,
              padding: '1.25rem 1rem',
              textAlign: 'center',
              backgroundColor: '#FAFAFA',
              cursor: 'pointer',
              position: 'relative'
            }}>
              <input
                type="file"
                accept=".pdf,.pptx,.ppt"
                onChange={(e) => {
                  setFile(e.target.files[0]);
                  if (e.target.files[0]) {
                    setTitle(e.target.files[0].name.replace(/\.[^/.]+$/, ""));
                  }
                }}
                style={{
                  position: 'absolute',
                  inset: 0,
                  opacity: 0,
                  cursor: 'pointer',
                  width: '100%'
                }}
              />
              <UploadCloud size={28} color="#0A4D3C" style={{ margin: '0 auto 0.35rem' }} />
              <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#111827' }}>
                {file ? file.name : 'Click to select custom PDF or PowerPoint'}
              </div>
              <div style={{ fontSize: '0.72rem', color: '#9CA3AF', marginTop: '0.2rem' }}>
                Auto-chunked by PyMuPDF / python-pptx
              </div>
            </div>
          </div>

          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem' }}>
              <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#6B7280', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                STRUGGLE REITERATION THRESHOLD
              </label>
              <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0A4D3C' }}>{threshold}% (10/40)</span>
            </div>
            <input
              type="range"
              min="5"
              max="60"
              step="5"
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              style={{ width: '100%', accentColor: '#0A4D3C' }}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
              backgroundColor: '#0A4D3C',
              color: '#FFFFFF',
              border: 'none',
              borderRadius: 12,
              padding: '0.85rem',
              fontSize: '0.95rem',
              fontWeight: 700,
              cursor: 'pointer',
              marginTop: '0.25rem',
              boxShadow: '0 4px 12px rgba(10, 77, 60, 0.2)'
            }}
          >
            {loading ? 'Launching Classroom...' : 'Launch Live Classroom Cockpit'}
          </button>
        </form>
      </div>
    </div>
  );
}
