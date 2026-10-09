import React, { useState } from 'react';
import { Menu, Grid, Plus, LogOut } from 'lucide-react';
import UserAvatar from './UserAvatar';

export default function Navbar({ 
  activeTab, 
  setActiveTab, 
  sessionTitle = "Physics 101 — Newton's Laws",
  roomCode = "ROOM304",
  user,
  onLogout,
  onUploadClick
}) {
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  return (
    <header style={{
      backgroundColor: '#ffffff',
      borderBottom: '1px solid var(--google-border)',
      height: '64px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0 16px',
      position: 'sticky',
      top: 0,
      zIndex: 100,
      boxShadow: '0 1px 2px 0 rgba(60,64,67,0.1), 0 2px 6px 2px rgba(60,64,67,0.05)'
    }}>
      
      {/* Left Section: Drawer Menu, Classroom Icon & Course Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <button 
          className="btn-google-text"
          style={{ padding: '10px', borderRadius: '50%', color: '#5f6368' }}
          title="Main menu"
        >
          <Menu size={20} />
        </button>

        {/* Google Classroom Icon */}
        <div style={{
          width: '36px',
          height: '36px',
          borderRadius: '4px',
          backgroundColor: '#137333',
          color: '#ffffff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          fontSize: '18px'
        }} title="Google Classroom">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
            <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
          </svg>
        </div>

        {/* Course Title */}
        <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-dark)', letterSpacing: '-0.01em' }}>
              {sessionTitle}
            </span>
            <span style={{
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: '#e8f0fe',
              color: '#174ea6',
              padding: '2px 8px',
              borderRadius: '12px',
              fontFamily: 'var(--font-mono)'
            }}>
              {roomCode}
            </span>
          </div>
          <span style={{ fontSize: '12px', color: '#5f6368', marginTop: '-2px' }}>
            Section 01
          </span>
        </div>
      </div>

      {/* Center Section: Google Classroom Header Tabs */}
      <nav style={{ display: 'flex', height: '100%', alignItems: 'center', gap: '4px' }}>
        <button 
          className={`gc-tab ${activeTab === 'stream' ? 'active' : ''}`}
          onClick={() => setActiveTab('stream')}
        >
          Stream
        </button>

        <button 
          className={`gc-tab ${activeTab === 'classwork' ? 'active' : ''}`}
          onClick={() => setActiveTab('classwork')}
        >
          Classwork
        </button>

        <button 
          className={`gc-tab ${activeTab === 'people' ? 'active' : ''}`}
          onClick={() => setActiveTab('people')}
        >
          People
        </button>

        <button 
          className={`gc-tab ${activeTab === 'grades' ? 'active' : ''}`}
          onClick={() => setActiveTab('grades')}
        >
          Grades
        </button>
      </nav>

      {/* Right Section: Plus Icon, Google Apps Grid & User Avatar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
        <button 
          className="btn-google-text"
          onClick={onUploadClick}
          style={{ padding: '10px', borderRadius: '50%', color: '#5f6368' }}
          title="Create or join class"
        >
          <Plus size={20} />
        </button>

        <button 
          className="btn-google-text"
          style={{ padding: '10px', borderRadius: '50%', color: '#5f6368' }}
          title="Google apps"
        >
          <Grid size={20} />
        </button>

        <button 
          onClick={() => setShowProfileMenu(!showProfileMenu)}
          style={{
            background: 'none',
            border: 'none',
            padding: '2px',
            borderRadius: '50%',
            cursor: 'pointer',
            marginLeft: '4px'
          }}
          title="Google Account"
        >
          <UserAvatar name={user?.name || user?.email || 'Prof. Harrison'} size={34} />
        </button>

        {showProfileMenu && (
          <div className="animate-fade-in" style={{
            position: 'absolute',
            top: '52px',
            right: 0,
            backgroundColor: '#ffffff',
            border: '1px solid var(--google-border)',
            borderRadius: '8px',
            boxShadow: 'var(--shadow-pop)',
            padding: '16px',
            width: '260px',
            zIndex: 1000
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '12px', paddingBottom: '12px', borderBottom: '1px solid var(--google-border-subtle)' }}>
              <UserAvatar name={user?.name || user?.email || 'Prof. Harrison'} size={40} />
              <div style={{ overflow: 'hidden' }}>
                <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {user?.name || 'Prof. Harrison'}
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>
                  {user?.email || 'prof.harrison@university.edu'}
                </div>
              </div>
            </div>

            <button 
              onClick={() => {
                setShowProfileMenu(false);
                onLogout && onLogout();
              }}
              className="btn-google-text"
              style={{ width: '100%', justifyContent: 'flex-start', color: '#c5221f' }}
            >
              <LogOut size={16} /> Sign out
            </button>
          </div>
        )}
      </div>

    </header>
  );
}
