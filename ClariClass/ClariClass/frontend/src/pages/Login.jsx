import React, { useState } from 'react';
import { Mail, BookOpen } from 'lucide-react';

export default function Login({ onLoginSuccess }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('teacher');

  const handleLogin = (e) => {
    e?.preventDefault();
    const userEmail = email.trim() || (role === 'teacher' ? 'prof.harrison@university.edu' : 'alex.rivera@university.edu');
    
    const userObj = {
      email: userEmail,
      name: role === 'teacher' ? 'Prof. Harrison' : 'Alex Rivera',
      role: role
    };

    localStorage.setItem('clariclass_user', JSON.stringify(userObj));
    localStorage.setItem('clariclass_token', 'mock_dev_token');
    onLoginSuccess(userObj);
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
      {/* Google Classroom Logo & Title */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px' }}>
        <div style={{
          width: 44,
          height: 44,
          borderRadius: 8,
          backgroundColor: 'var(--google-green)',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <BookOpen size={26} />
        </div>
        <span style={{ fontSize: '26px', fontWeight: 500, color: 'var(--text-dark)' }}>
          Google Classroom
        </span>
      </div>

      {/* Main Sign In Card */}
      <div className="gc-card" style={{
        width: '100%',
        maxWidth: 440,
        padding: '36px 32px',
        boxShadow: 'var(--shadow-card)'
      }}>
        <h2 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-dark)', marginBottom: '8px' }}>
          Sign in
        </h2>
        <p style={{ fontSize: '14px', color: 'var(--text-muted)', marginBottom: '24px' }}>
          Use your Google Account or institutional email to continue to Classroom.
        </p>

        <form onSubmit={handleLogin} style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: 'var(--text-muted)', marginBottom: '6px' }}>
              Email or phone
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@university.edu"
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

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {/* Role switch pill */}
            <div style={{ display: 'flex', gap: '4px', background: 'var(--google-surface-variant)', padding: '2px', borderRadius: '4px' }}>
              <button
                type="button"
                onClick={() => setRole('teacher')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: role === 'teacher' ? '#ffffff' : 'transparent',
                  color: role === 'teacher' ? 'var(--google-blue)' : 'var(--text-muted)',
                  boxShadow: role === 'teacher' ? 'var(--shadow-sm)' : 'none'
                }}
              >
                Teacher
              </button>
              <button
                type="button"
                onClick={() => setRole('student')}
                style={{
                  padding: '4px 12px',
                  borderRadius: '4px',
                  border: 'none',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  backgroundColor: role === 'student' ? '#ffffff' : 'transparent',
                  color: role === 'student' ? 'var(--google-blue)' : 'var(--text-muted)',
                  boxShadow: role === 'student' ? 'var(--shadow-sm)' : 'none'
                }}
              >
                Student
              </button>
            </div>

            <button type="submit" className="btn-google-primary">
              Next
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
