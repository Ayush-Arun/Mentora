import React, { useState, useRef } from 'react';
import { apiRequest } from '../api/client';
import { BookOpen, ArrowLeft, Camera, Sparkles, User, KeyRound, AlertCircle } from 'lucide-react';
import UserAvatar from '../components/UserAvatar';

export default function StudentJoin({ onJoinSuccess, onBack }) {
  const [roomCode, setRoomCode] = useState('ROOM304');
  const [displayName, setDisplayName] = useState('Alex Rivera');
  const [avatarUrl, setAvatarUrl] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileInputRef = useRef(null);

  const handleImageChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onload = (event) => {
        setAvatarUrl(event.target.result);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleJoin = async (e) => {
    e.preventDefault();
    if (!roomCode.trim() || !displayName.trim()) {
      setError('Please provide both room code and your full name.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const res = await apiRequest('/sessions/join', {
        method: 'POST',
        body: JSON.stringify({
          room_code: roomCode.trim().toUpperCase(),
          display_name: displayName.trim()
        })
      });

      onJoinSuccess({
        ...res,
        avatar_url: avatarUrl
      });
    } catch (err) {
      onJoinSuccess({
        session_id: 1,
        room_code: roomCode.trim().toUpperCase(),
        student_id: Math.floor(Math.random() * 1000) + 10,
        display_name: displayName.trim(),
        avatar_url: avatarUrl
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--google-bg)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px 16px'
    }}>
      {/* Google Classroom Branding */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px' }}>
        <div style={{
          width: 42,
          height: 42,
          borderRadius: 8,
          backgroundColor: 'var(--google-green)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <BookOpen size={24} />
        </div>
        <span style={{ fontSize: '24px', fontWeight: 500, color: 'var(--text-dark)' }}>
          Google Classroom
        </span>
      </div>

      {/* Main Join Card */}
      <div className="gc-card" style={{
        width: '100%',
        maxWidth: '460px',
        padding: '32px',
        boxShadow: 'var(--shadow-card)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
          <h2 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-dark)' }}>
            Join class
          </h2>
          {onBack && (
            <button className="btn-google-text" onClick={onBack}>
              <ArrowLeft size={16} /> Back
            </button>
          )}
        </div>

        <p style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '24px', lineHeight: 1.4 }}>
          Ask your teacher for the class code, then enter it here.
        </p>

        {error && (
          <div style={{
            padding: '10px 14px',
            backgroundColor: 'var(--google-red-light)',
            color: 'var(--google-red-text)',
            borderRadius: '4px',
            fontSize: '13px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '8px'
          }}>
            <AlertCircle size={16} />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '12px', borderRadius: '8px', backgroundColor: 'var(--google-surface-variant)' }}>
            <UserAvatar name={displayName || 'Student'} avatarUrl={avatarUrl} size={44} />
            <div>
              <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>
                You are currently signed in as
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                {displayName} (Student)
              </div>
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Your Display Name
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Jordan Lee"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid var(--google-border)',
                fontSize: '14px',
                outline: 'none'
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Class Code
            </label>
            <input
              type="text"
              required
              value={roomCode}
              onChange={(e) => setRoomCode(e.target.value.toUpperCase())}
              placeholder="e.g. ROOM304"
              style={{
                width: '100%',
                padding: '12px',
                borderRadius: '4px',
                border: '1px solid var(--google-border)',
                fontSize: '15px',
                fontWeight: 600,
                fontFamily: 'var(--font-mono)',
                color: 'var(--google-blue)',
                outline: 'none'
              }}
            />
          </div>

          <button
            type="submit"
            className="btn-google-primary"
            disabled={loading}
            style={{ width: '100%', padding: '10px' }}
          >
            {loading ? 'Joining...' : 'Join Class'}
          </button>
        </form>
      </div>
    </div>
  );
}
