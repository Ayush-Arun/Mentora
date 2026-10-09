import React, { useState } from 'react';
import { 
  Menu, 
  Grid, 
  Plus, 
  Folder, 
  MoreVertical, 
  Maximize2, 
  FileText, 
  LogOut,
  ChevronRight
} from 'lucide-react';
import LeftRail from '../components/LeftRail';
import UserAvatar from '../components/UserAvatar';

export default function ClassroomHome({ user, onSelectClass, onLogout }) {
  const [isRailExpanded, setIsRailExpanded] = useState(false);
  const [showProfileMenu, setShowProfileMenu] = useState(false);

  // List of enrolled/teaching classes matching the user's screenshot
  const classesList = [
    {
      id: 'physics101',
      title: "Physics 101 — Newton's Laws",
      section: "Section 01",
      teacher: "Prof. Harrison",
      roomCode: "ROOM304",
      headerBg: "linear-gradient(135deg, #137333 0%, #0d652d 100%)", // Green
      avatarText: "P",
      avatarBg: "#9c27b0",
      dueText: null
    },
    {
      id: '25hs510',
      title: "25HS510-EVS",
      section: "",
      teacher: "Nithya N",
      headerBg: "linear-gradient(135deg, #00897b 0%, #00695c 100%)", // Teal green
      avatarText: "N",
      avatarBg: "#ab47bc",
      dueText: null
    },
    {
      id: '24ci52',
      title: "24CI52- AI and Agents",
      section: "",
      teacher: "Nithya N",
      headerBg: "linear-gradient(135deg, #0288d1 0%, #01579b 100%)", // Light Blue
      avatarText: "N",
      avatarBg: "#ab47bc",
      dueText: null
    },
    {
      id: 'fullstack',
      title: "Full Stack Development",
      section: "A",
      teacher: "Shrilaxmi Gidd",
      headerBg: "linear-gradient(135deg, #1976d2 0%, #0d47a1 100%)", // Blue
      avatarText: "S",
      avatarBg: "#ef6c00",
      dueText: null
    },
    {
      id: 'swe_mlops',
      title: "Software Engineering with MLOps",
      section: "A&B",
      teacher: "Dr. Sajini G",
      headerBg: "linear-gradient(135deg, #455a64 0%, #263238 100%)", // Dark Slate
      avatarText: "D",
      avatarBg: "#d84315",
      dueText: "Due Sunday\n11:59 PM - 10 Mark Component submission"
    },
    {
      id: 'bigdata',
      title: "Big Data Systems - 24...",
      section: "A",
      teacher: "PRASHANTH REDDY C",
      headerBg: "linear-gradient(135deg, #1565c0 0%, #0d47a1 100%)",
      avatarText: "P",
      avatarBg: "#2e7d32",
      dueText: null
    },
    {
      id: 'devops',
      title: "CIAEC59-A-DevOps",
      section: "",
      teacher: "PRASHANTH REDDY C",
      headerBg: "linear-gradient(135deg, #e64a19 0%, #d84315 100%)", // Red Orange
      avatarText: "P",
      avatarBg: "#2e7d32",
      dueText: null
    },
    {
      id: 'nosql',
      title: "NoSQL",
      section: "B",
      teacher: "Staff",
      headerBg: "linear-gradient(135deg, #0288d1 0%, #0277bd 100%)",
      avatarText: "S",
      avatarBg: "#1565c0",
      dueText: null
    },
    {
      id: 'design_alg',
      title: "24CI43 - Design and A...",
      section: "4th Sem 'B'",
      teacher: "Staff",
      headerBg: "linear-gradient(135deg, #f57c00 0%, #ef6c00 100%)", // Orange
      avatarText: "S",
      avatarBg: "#1565c0",
      dueText: null
    }
  ];

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--google-bg)' }}>
      
      {/* Top App Bar Header */}
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
        zIndex: 100
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <button 
            className="btn-google-text"
            onClick={() => setIsRailExpanded(!isRailExpanded)}
            style={{ padding: '10px', borderRadius: '50%', color: '#5f6368' }}
            title="Main menu"
          >
            <Menu size={20} />
          </button>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '4px',
              backgroundColor: '#137333',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/>
                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/>
              </svg>
            </div>
            <span style={{ fontSize: '20px', fontWeight: 400, color: '#3c4043', letterSpacing: '-0.01em', fontFamily: 'var(--font-sans)' }}>
              Classroom
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', position: 'relative' }}>
          <button className="btn-google-text" style={{ padding: '10px', borderRadius: '50%', color: '#5f6368' }} title="Create or join a class">
            <Plus size={20} />
          </button>

          <button className="btn-google-text" style={{ padding: '10px', borderRadius: '50%', color: '#5f6368' }} title="Google apps">
            <Grid size={20} />
          </button>

          <button 
            onClick={() => setShowProfileMenu(!showProfileMenu)}
            style={{ background: 'none', border: 'none', padding: '2px', borderRadius: '50%', cursor: 'pointer', marginLeft: '4px' }}
            title="Google Account"
          >
            <UserAvatar name={user?.name || user?.email || 'M Deemanth'} size={34} />
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
                <UserAvatar name={user?.name || user?.email || 'M Deemanth'} size={40} />
                <div style={{ overflow: 'hidden' }}>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>
                    {user?.name || 'M Deemanth'}
                  </div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {user?.email || 'deemanth@university.edu'}
                  </div>
                </div>
              </div>

              <button 
                onClick={() => { setShowProfileMenu(false); onLogout && onLogout(); }}
                className="btn-google-text"
                style={{ width: '100%', justifyContent: 'flex-start', color: '#c5221f' }}
              >
                <LogOut size={16} /> Sign out
              </button>
            </div>
          )}
        </div>
      </header>

      {/* Main Body with Left Vertical Rail */}
      <div style={{ display: 'flex', flex: 1 }}>
        <LeftRail 
          activeNav="home"
          onNavSelect={(nav) => console.log('Selected nav:', nav)}
          isExpanded={isRailExpanded}
          toggleExpand={() => setIsRailExpanded(!isRailExpanded)}
        />

        {/* Scrollable Workspace */}
        <div style={{ flex: 1, padding: '24px 32px', overflowY: 'auto', maxWidth: '1280px', margin: '0 auto' }}>
          
          {/* SECTION 1: Due soon Card Box */}
          <div className="gc-card" style={{ padding: '20px', marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-dark)' }}>
                Due soon
              </h2>
              <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                <button className="btn-google-text" style={{ fontSize: '13px', color: 'var(--google-blue)', padding: '4px 8px' }}>
                  View To-do
                </button>
                <Maximize2 size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} />
              </div>
            </div>

            <div style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '12px 16px',
              backgroundColor: '#ffffff',
              border: '1px solid var(--google-border-subtle)',
              borderRadius: '6px'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                <div style={{ color: 'var(--text-muted)' }}>
                  <FileText size={20} />
                </div>
                <div>
                  <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>
                    10 Mark Component submission
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '40px' }}>
                <div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>Class</div>
                  <div style={{ fontSize: '13px', color: 'var(--google-blue)', fontWeight: 500 }}>
                    Software Engineering with MLOps
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
                    Sun, Oct 11, 11:59 PM
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: Class learning tools Card Box */}
          <div className="gc-card" style={{ padding: '20px', marginBottom: '32px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 500, color: 'var(--text-dark)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Class learning tools <span style={{ fontSize: '14px', color: 'var(--text-muted)', fontWeight: 400 }}>ⓘ</span>
              </h2>
              <Maximize2 size={16} color="var(--text-muted)" style={{ cursor: 'pointer' }} />
            </div>

            <div style={{ fontSize: '14px', color: 'var(--text-muted)', textAlign: 'center', padding: '16px 0' }}>
              You don't have any assigned class learning tools
            </div>
          </div>

          {/* SECTION 3: Classes Header & Card Grid */}
          <div style={{ marginBottom: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 500, color: 'var(--text-dark)' }}>
                Classes
              </h2>
              <button className="btn-google-text" style={{ fontSize: '14px', color: 'var(--google-blue)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Plus size={16} /> Add class
              </button>
            </div>

            {/* Grid of Class Cards (4 Columns) */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
              gap: '24px'
            }}>
              {classesList.map((cls) => (
                <div 
                  key={cls.id}
                  className="gc-card gc-card-hover"
                  onClick={() => onSelectClass && onSelectClass(cls)}
                  style={{
                    overflow: 'hidden',
                    display: 'flex',
                    flexDirection: 'column',
                    height: '280px',
                    position: 'relative',
                    cursor: 'pointer'
                  }}
                >
                  {/* Top Colored Banner Header */}
                  <div style={{
                    background: cls.headerBg,
                    padding: '16px 20px',
                    color: '#ffffff',
                    height: '110px',
                    position: 'relative'
                  }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ flex: 1, paddingRight: '12px' }}>
                        <h3 style={{
                          fontSize: '18px',
                          fontWeight: 500,
                          margin: 0,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          lineHeight: 1.3
                        }}>
                          {cls.title}
                        </h3>
                        {cls.section && (
                          <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '2px' }}>
                            {cls.section}
                          </div>
                        )}
                        <div style={{ fontSize: '13px', opacity: 0.9, marginTop: '4px' }}>
                          {cls.teacher}
                        </div>
                      </div>

                      <button className="btn-google-text" style={{ padding: '4px', color: '#ffffff' }}>
                        <MoreVertical size={18} />
                      </button>
                    </div>

                    {/* Teacher Avatar Overlay Circle */}
                    <div style={{
                      position: 'absolute',
                      right: '16px',
                      bottom: '-24px',
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      backgroundColor: cls.avatarBg,
                      color: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '22px',
                      fontWeight: 600,
                      border: '3px solid #ffffff',
                      boxShadow: 'var(--shadow-sm)'
                    }}>
                      {cls.avatarText}
                    </div>
                  </div>

                  {/* Card Middle / Due Content */}
                  <div style={{ flex: 1, padding: '32px 20px 16px 20px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                    <div>
                      {cls.dueText ? (
                        <div style={{ fontSize: '12px', color: 'var(--text-body)', lineHeight: 1.4 }}>
                          <span style={{ fontWeight: 600, color: 'var(--text-dark)' }}>Due Sunday</span>
                          <br />
                          11:59 PM - 10 Mark Component submission
                        </div>
                      ) : (
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          No upcoming work
                        </div>
                      )}
                    </div>

                    {/* Bottom Action Icons */}
                    <div style={{
                      display: 'flex',
                      justify: 'flex-end',
                      alignItems: 'center',
                      gap: '16px',
                      borderTop: '1px solid var(--google-border-subtle)',
                      paddingTop: '10px'
                    }}>
                      <button className="btn-google-text" style={{ padding: '6px', color: 'var(--text-muted)' }} title="Your work">
                        <UserAvatar name={cls.teacher} size={18} />
                      </button>
                      <button className="btn-google-text" style={{ padding: '6px', color: 'var(--text-muted)' }} title="Open folder">
                        <Folder size={18} />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

    </div>
  );
}
