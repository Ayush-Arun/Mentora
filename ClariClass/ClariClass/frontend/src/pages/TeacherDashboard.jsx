import React, { useState } from 'react';
import { 
  MoreVertical, 
  Copy, 
  Check, 
  Plus, 
  FileText, 
  Send
} from 'lucide-react';
import Navbar from '../components/Navbar';
import LeftRail from '../components/LeftRail';
import UserAvatar from '../components/UserAvatar';
import UploadModal from '../components/UploadModal';

export default function TeacherDashboard({ sessionData, onUploadClick, onEndSession, onGoHome }) {
  // Tabs: 'stream' | 'classwork' | 'people' | 'grades'
  const [activeTab, setActiveTab] = useState('stream');

  // Left rail collapse state
  const [isRailExpanded, setIsRailExpanded] = useState(false);

  // Upload Modal
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);

  // Active Session State
  const [session, setSession] = useState(sessionData || {
    room_code: 'ROOM304',
    title: "Physics 101 — Newton's Laws",
    document_id: 1
  });

  const [copiedCode, setCopiedCode] = useState(false);

  // Stream announcements state
  const [announcements, setAnnouncements] = useState([
    {
      id: 1,
      author: 'Prof. Harrison',
      avatar: 'P',
      time: '10:15 AM',
      content: 'Welcome to today\'s lecture on Newton\'s Laws of Motion! Please follow along with the attached slides in Classwork.',
      comments: [
        { id: 101, author: 'Marcus Webb', text: 'Thank you Professor!', time: '10:17 AM' }
      ]
    }
  ]);
  const [newAnnouncementText, setNewAnnouncementText] = useState('');
  const [isPostingAnnouncement, setIsPostingAnnouncement] = useState(false);
  const [commentInputs, setCommentInputs] = useState({});

  // Student roster
  const [students] = useState([
    { id: 1, name: "Marcus Webb", email: "marcus.webb@university.edu" },
    { id: 2, name: "Priya Nair", email: "priya.nair@university.edu" },
    { id: 3, name: "Daniel Okoro", email: "daniel.okoro@university.edu" },
    { id: 4, name: "Sofia Reyes", email: "sofia.reyes@university.edu" },
    { id: 5, name: "Liam Foster", email: "liam.foster@university.edu" },
    { id: 6, name: "Amara Diallo", email: "amara.diallo@university.edu" },
    { id: 7, name: "Noah Bennett", email: "noah.bennett@university.edu" }
  ]);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(session.room_code || 'ROOM304');
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handlePostAnnouncement = () => {
    if (!newAnnouncementText.trim()) return;
    setAnnouncements(prev => [
      {
        id: Date.now(),
        author: 'Prof. Harrison',
        avatar: 'P',
        time: 'Just now',
        content: newAnnouncementText,
        comments: []
      },
      ...prev
    ]);
    setNewAnnouncementText('');
    setIsPostingAnnouncement(false);
  };

  const handleAddComment = (postId) => {
    const text = commentInputs[postId];
    if (!text || !text.trim()) return;

    setAnnouncements(prev => prev.map(p => {
      if (p.id === postId) {
        return {
          ...p,
          comments: [
            ...(p.comments || []),
            { id: Date.now(), author: 'Prof. Harrison', text: text.trim(), time: 'Just now' }
          ]
        };
      }
      return p;
    }));

    setCommentInputs(prev => ({ ...prev, [postId]: '' }));
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: 'var(--google-bg)' }}>
      {/* Google Classroom Top App Navbar */}
      <Navbar 
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        sessionTitle={session.title || "Physics 101 — Newton's Laws"}
        roomCode={session.room_code || 'ROOM304'}
        user={{ name: 'Prof. Harrison' }}
        onLogout={onEndSession}
        onUploadClick={() => setIsUploadModalOpen(true)}
      />

      {/* Workspace with Left Navigation Rail */}
      <div style={{ display: 'flex', flex: 1 }}>
        <LeftRail 
          activeNav="enrolled"
          onNavSelect={(id) => {
            if (id === 'home') {
              onGoHome && onGoHome();
            }
          }}
          isExpanded={isRailExpanded}
          toggleExpand={() => setIsRailExpanded(!isRailExpanded)}
        />

        <div style={{ flex: 1, padding: '24px 16px', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1000px', margin: '0 auto' }}>
            
            {/* GOOGLE CLASSROOM COVER BANNER */}
            <div style={{
              background: 'linear-gradient(135deg, #1967d2 0%, #1557b0 50%, #174ea6 100%)',
              borderRadius: '8px',
              padding: '32px',
              color: '#ffffff',
              position: 'relative',
              overflow: 'hidden',
              marginBottom: '24px',
              boxShadow: 'var(--shadow-sm)',
              height: '240px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-end'
            }}>
              <div style={{
                position: 'absolute',
                right: '-20px',
                top: '-20px',
                opacity: 0.15,
                pointerEvents: 'none'
              }}>
                <svg width="300" height="300" viewBox="0 0 200 200" fill="none">
                  <circle cx="100" cy="100" r="80" stroke="#ffffff" strokeWidth="8"/>
                  <path d="M40 100 L160 100 M100 40 L100 160" stroke="#ffffff" strokeWidth="6"/>
                </svg>
              </div>

              <div style={{ position: 'relative', zIndex: 1 }}>
                <h1 style={{ fontSize: '36px', fontWeight: 500, margin: '0 0 6px 0', letterSpacing: '-0.01em' }}>
                  {session.title || "Physics 101 — Newton's Laws"}
                </h1>
                <p style={{ fontSize: '16px', opacity: 0.9, margin: 0, fontWeight: 400 }}>
                  Section 01
                </p>
              </div>
            </div>

            {/* TAB 1: STREAM */}
            {activeTab === 'stream' && (
              <div style={{
                display: 'grid',
                gridTemplateColumns: '200px 1fr',
                gap: '24px',
                alignItems: 'start'
              }}>
                {/* Left Sidebar */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <div className="gc-card" style={{ padding: '16px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                      <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-dark)' }}>
                        Class code
                      </span>
                      <button className="btn-google-text" style={{ padding: '2px' }}>
                        <MoreVertical size={16} color="var(--text-muted)" />
                      </button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: '20px', fontWeight: 700, fontFamily: 'var(--font-mono)', color: 'var(--google-blue)', letterSpacing: '0.05em' }}>
                        {session.room_code || 'ROOM304'}
                      </span>
                      <button 
                        onClick={handleCopyCode}
                        style={{ background: 'none', border: 'none', color: 'var(--google-blue)', cursor: 'pointer', padding: '4px' }}
                        title="Copy Class Code"
                      >
                        {copiedCode ? <Check size={16} color="var(--google-green)" /> : <Copy size={16} />}
                      </button>
                    </div>
                  </div>

                  <div className="gc-card" style={{ padding: '16px' }}>
                    <h3 style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)', margin: '0 0 8px 0' }}>
                      Upcoming
                    </h3>
                    <div style={{ fontSize: '13px', color: 'var(--text-muted)', lineHeight: 1.4 }}>
                      Woohoo, no work due soon!
                    </div>
                    <button className="btn-google-text" style={{ width: '100%', justifyContent: 'flex-end', fontSize: '12px', color: 'var(--google-blue)', marginTop: '12px', padding: 0 }}>
                      View all
                    </button>
                  </div>
                </div>

                {/* Center Stream Feed */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {!isPostingAnnouncement ? (
                    <div 
                      className="gc-card gc-card-hover"
                      onClick={() => setIsPostingAnnouncement(true)}
                      style={{
                        padding: '16px 20px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '14px',
                        cursor: 'pointer'
                      }}
                    >
                      <UserAvatar name="Prof. Harrison" size={36} />
                      <span style={{ fontSize: '14px', color: 'var(--text-muted)' }}>
                        Announce something to your class
                      </span>
                    </div>
                  ) : (
                    <div className="gc-card" style={{ padding: '20px' }}>
                      <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginBottom: '8px' }}>
                        Announce to <strong>Physics 101 — Newton's Laws</strong>
                      </div>
                      <textarea
                        value={newAnnouncementText}
                        onChange={(e) => setNewAnnouncementText(e.target.value)}
                        placeholder="Announce something to your class..."
                        rows={4}
                        style={{
                          width: '100%',
                          padding: '12px',
                          borderRadius: '4px',
                          border: '1px solid var(--google-border)',
                          fontSize: '14px',
                          resize: 'none',
                          outline: 'none',
                          marginBottom: '16px'
                        }}
                        autoFocus
                      />
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                        <button className="btn-google-text" onClick={() => setIsPostingAnnouncement(false)}>
                          Cancel
                        </button>
                        <button 
                          className="btn-google-primary"
                          onClick={handlePostAnnouncement}
                          disabled={!newAnnouncementText.trim()}
                        >
                          Post
                        </button>
                      </div>
                    </div>
                  )}

                  <div className="gc-card" style={{ padding: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <UserAvatar name="Prof. Harrison" size={36} />
                        <div>
                          <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>
                            Prof. Harrison posted a new material: Physics 101 Lecture Deck
                          </div>
                          <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                            10:15 AM
                          </div>
                        </div>
                      </div>
                      <button className="btn-google-text" style={{ padding: '4px' }}>
                        <MoreVertical size={16} color="var(--text-muted)" />
                      </button>
                    </div>

                    <div style={{
                      border: '1px solid var(--google-border)',
                      borderRadius: '8px',
                      padding: '16px',
                      backgroundColor: '#ffffff',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '14px',
                      cursor: 'pointer',
                      marginBottom: '16px'
                    }}>
                      <div style={{
                        width: '40px',
                        height: '40px',
                        borderRadius: '4px',
                        backgroundColor: 'var(--google-blue-light)',
                        color: 'var(--google-blue)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                      }}>
                        <FileText size={22} />
                      </div>
                      <div>
                        <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>
                          Newton's Laws of Motion — Slide Deck & Notes
                        </div>
                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          PDF / Presentation Material
                        </div>
                      </div>
                    </div>

                    <div style={{ borderTop: '1px solid var(--google-border-subtle)', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <UserAvatar name="Prof. Harrison" size={28} />
                      <input
                        type="text"
                        placeholder="Add class comment..."
                        style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', backgroundColor: 'transparent' }}
                      />
                    </div>
                  </div>

                  {announcements.map((post) => (
                    <div key={post.id} className="gc-card" style={{ padding: '20px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <UserAvatar name={post.author} size={36} />
                          <div>
                            <div style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>{post.author}</div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{post.time}</div>
                          </div>
                        </div>
                        <button className="btn-google-text" style={{ padding: '4px' }}>
                          <MoreVertical size={16} color="var(--text-muted)" />
                        </button>
                      </div>

                      <div style={{ fontSize: '14px', lineHeight: 1.5, color: 'var(--text-body)', marginBottom: '16px' }}>
                        {post.content}
                      </div>

                      {post.comments && post.comments.length > 0 && (
                        <div style={{ borderTop: '1px solid var(--google-border-subtle)', paddingTop: '12px', marginBottom: '12px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                          {post.comments.map(c => (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px' }}>
                              <UserAvatar name={c.author} size={26} />
                              <div>
                                <strong style={{ color: 'var(--text-dark)' }}>{c.author}</strong> <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{c.time}</span>
                                <div style={{ color: 'var(--text-body)' }}>{c.text}</div>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}

                      <div style={{ borderTop: '1px solid var(--google-border-subtle)', paddingTop: '12px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <UserAvatar name="Prof. Harrison" size={28} />
                        <input
                          type="text"
                          value={commentInputs[post.id] || ''}
                          onChange={(e) => setCommentInputs({ ...commentInputs, [post.id]: e.target.value })}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddComment(post.id)}
                          placeholder="Add class comment..."
                          style={{ flex: 1, border: 'none', outline: 'none', fontSize: '13px', backgroundColor: 'transparent' }}
                        />
                        {commentInputs[post.id]?.trim() && (
                          <button className="btn-google-text" onClick={() => handleAddComment(post.id)} style={{ padding: '4px' }}>
                            <Send size={16} color="var(--google-blue)" />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}

                </div>
              </div>
            )}

            {/* TAB 2: CLASSWORK */}
            {activeTab === 'classwork' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <button 
                    className="btn-google-primary"
                    onClick={() => setIsUploadModalOpen(true)}
                    style={{ borderRadius: '24px', padding: '12px 28px', fontSize: '14px', boxShadow: 'var(--shadow-card)' }}
                  >
                    <Plus size={20} /> Create
                  </button>
                </div>

                <div style={{ borderBottom: '1px solid var(--google-border)', paddingBottom: '24px' }}>
                  <h2 style={{ fontSize: '20px', fontWeight: 400, color: 'var(--google-blue)', marginBottom: '16px' }}>
                    Unit 1: Classical Mechanics & Motion
                  </h2>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                    {["Newton's First Law: Inertia", "Newton's Second Law: F = ma", "Newton's Third Law: Action & Reaction"].map((title, idx) => (
                      <div key={idx} className="gc-card gc-card-hover" style={{
                        padding: '16px 20px',
                        display: 'flex',
                        justify: 'space-between',
                        alignItems: 'center',
                        cursor: 'pointer'
                      }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                          <div style={{
                            width: '36px',
                            height: '36px',
                            borderRadius: '50%',
                            backgroundColor: 'var(--google-blue-light)',
                            color: 'var(--google-blue)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}>
                            <FileText size={20} />
                          </div>
                          <div>
                            <div style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-dark)' }}>
                              {title}
                            </div>
                            <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                              Posted 10:15 AM
                            </div>
                          </div>
                        </div>

                        <button className="btn-google-text" style={{ padding: '6px' }}>
                          <MoreVertical size={18} color="var(--text-muted)" />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 3: PEOPLE */}
            {activeTab === 'people' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '32px' }}>
                <div>
                  <div style={{ borderBottom: '2px solid var(--google-blue)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 400, color: 'var(--google-blue)' }}>
                      Teachers
                    </h2>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px', padding: '12px 8px' }}>
                    <UserAvatar name="Prof. Harrison" size={40} />
                    <span style={{ fontSize: '15px', fontWeight: 500, color: 'var(--text-dark)' }}>
                      Prof. Harrison
                    </span>
                  </div>
                </div>

                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid var(--google-blue)', paddingBottom: '12px', marginBottom: '16px' }}>
                    <h2 style={{ fontSize: '24px', fontWeight: 400, color: 'var(--google-blue)' }}>
                      Classmates ({students.length})
                    </h2>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {students.map((student) => (
                      <div key={student.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 8px', borderBottom: '1px solid var(--google-border-subtle)' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                          <UserAvatar name={student.name} size={36} />
                          <span style={{ fontSize: '14px', fontWeight: 500, color: 'var(--text-dark)' }}>
                            {student.name}
                          </span>
                        </div>
                        <button className="btn-google-text" style={{ padding: '6px' }}>
                          <MoreVertical size={16} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* TAB 4: GRADES */}
            {activeTab === 'grades' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                <h2 style={{ fontSize: '20px', fontWeight: 400, color: 'var(--text-dark)' }}>
                  Grades
                </h2>
                <div className="gc-card" style={{ padding: '0', overflow: 'hidden' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px', textAlign: 'left' }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--google-border)', backgroundColor: 'var(--google-surface-variant)' }}>
                        <th style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-muted)' }}>Student name</th>
                        <th style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-muted)' }}>Unit 1 Quiz</th>
                        <th style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-muted)' }}>Slide Participation</th>
                        <th style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-muted)' }}>Overall Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {students.map((s) => (
                        <tr key={s.id} style={{ borderBottom: '1px solid var(--google-border-subtle)' }}>
                          <td style={{ padding: '14px 20px', fontWeight: 500, color: 'var(--text-dark)' }}>{s.name}</td>
                          <td style={{ padding: '14px 20px', color: 'var(--text-body)' }}>95%</td>
                          <td style={{ padding: '14px 20px', color: 'var(--text-body)' }}>100%</td>
                          <td style={{ padding: '14px 20px', fontWeight: 600, color: 'var(--google-green-text)' }}>A (96%)</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {isUploadModalOpen && (
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onUploadSuccess={() => setIsUploadModalOpen(false)}
        />
      )}
    </div>
  );
}
