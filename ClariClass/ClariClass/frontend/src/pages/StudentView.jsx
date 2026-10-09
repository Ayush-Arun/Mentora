import React, { useState, useEffect } from 'react';
import { 
  BookOpen, 
  Flag, 
  Sparkles, 
  Eye, 
  EyeOff, 
  HelpCircle, 
  ArrowLeft, 
  Lightbulb,
  CheckCircle2
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { socket, joinClassroom } from '../api/socket';
import { gazeTracker } from '../services/gazeTracker';
import CalibrationModal from '../components/CalibrationModal';
import UserAvatar from '../components/UserAvatar';

export default function StudentView({ sessionData, onBack }) {
  const [session, setSession] = useState(sessionData || {
    room_code: 'ROOM304',
    title: "Physics 101 — Newton's Laws",
    student_id: 1,
    display_name: 'Alex Rivera'
  });

  const [chunks, setChunks] = useState([]);
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [activeReiteration, setActiveReiteration] = useState(null);
  const [activeQuiz, setActiveQuiz] = useState(null);
  const [quizAnswered, setQuizAnswered] = useState(false);
  const [selectedOption, setSelectedOption] = useState(null);
  
  // Privacy & Eye tracking state
  const [isCalibModalOpen, setIsCalibModalOpen] = useState(false);
  const [cameraEnabled, setCameraEnabled] = useState(false);

  // Student flag state
  const [flaggedBlocks, setFlaggedBlocks] = useState({});
  const [importantBlocks, setImportantBlocks] = useState({});

  const fetchSessionChunks = async () => {
    try {
      const roomCode = session.room_code || 'ROOM304';
      const res = await apiRequest(`/analytics/class/${roomCode}`);
      if (res?.chunks && res.chunks.length > 0) {
        setChunks(res.chunks);
      }
    } catch (err) {
      if (chunks.length === 0) {
        setChunks([
          {
            chunk_id: 1,
            order: 1,
            title: "Newton's First Law: Inertia",
            text: "An object at rest stays at rest and an object in motion stays in motion with the same speed and in the same direction unless acted upon by an unbalanced force. This tendency to resist changes in state of motion is termed inertia.",
            simplified_text: "Inertia means things keep doing what they're doing unless pushed. A stationary ball stays still; a moving ball keeps rolling forever unless friction, gravity, or a wall stops it."
          },
          {
            chunk_id: 2,
            order: 2,
            title: "Newton's Second Law: F = ma",
            text: "The acceleration of an object as produced by a net force is directly proportional to the magnitude of the net force, in the same direction as the net force, and inversely proportional to the mass of the object.",
            simplified_text: "Force equals mass times acceleration (F = m × a). Heavier objects need stronger pushes to speed up."
          },
          {
            chunk_id: 3,
            order: 3,
            title: "Newton's Third Law: Action & Reaction",
            text: "For every action, there is an equal and opposite reaction. Whenever one body exerts a force on a second body, the first body experiences a force that is equal in magnitude and opposite in direction.",
            simplified_text: "Every action has an equal and opposite reaction."
          }
        ]);
      }
    }
  };

  useEffect(() => {
    fetchSessionChunks();

    if (session.room_code) {
      joinClassroom(session.room_code);

      socket.on('slide_updated', (data) => {
        if (typeof data.slide_index === 'number') {
          setCurrentSlideIndex(data.slide_index);
          setActiveReiteration(null);
          setActiveQuiz(null);
          setQuizAnswered(false);
        }
      });

      socket.on('content_simplified', (data) => {
        if (data.simplified_text) {
          setActiveReiteration(data.simplified_text);
        }
      });

      socket.on('comprehension_triggered', (data) => {
        if (data.question) {
          setActiveQuiz(data);
          setQuizAnswered(false);
          setSelectedOption(null);
        }
      });
    }

    const unsubscribeGaze = gazeTracker.subscribe((state) => {
      setCameraEnabled(state.isTracking);
    });

    return () => {
      socket.off('slide_updated');
      socket.off('content_simplified');
      socket.off('comprehension_triggered');
      unsubscribeGaze();
    };
  }, [session.room_code]);

  const currentChunk = chunks[currentSlideIndex] || chunks[0];

  const handleFlagDifficult = async () => {
    if (!currentChunk) return;
    const cid = currentChunk.chunk_id || currentChunk.id || 1;
    setFlaggedBlocks(prev => ({ ...prev, [cid]: !prev[cid] }));

    try {
      await apiRequest('/signals/ingest', {
        method: 'POST',
        body: JSON.stringify({
          student_id: session.student_id || 1,
          chunk_id: cid,
          signal_type: 'flag_difficult',
          value: 1.0
        })
      });
    } catch (err) {}
  };

  const handleFlagImportant = async () => {
    if (!currentChunk) return;
    const cid = currentChunk.chunk_id || currentChunk.id || 1;
    setImportantBlocks(prev => ({ ...prev, [cid]: !prev[cid] }));

    try {
      await apiRequest('/signals/ingest', {
        method: 'POST',
        body: JSON.stringify({
          student_id: session.student_id || 1,
          chunk_id: cid,
          signal_type: 'flag_important',
          value: 1.0
        })
      });
    } catch (err) {}
  };

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--google-bg)' }}>
      {/* Top Header App Bar */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid var(--google-border)',
        padding: '12px 24px',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        boxShadow: 'var(--shadow-sm)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: 36,
            height: 36,
            borderRadius: 8,
            backgroundColor: 'var(--google-blue)',
            color: '#ffffff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            <BookOpen size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '16px', fontWeight: 500, color: 'var(--text-dark)' }}>
                {session.title || "Physics 101 — Newton's Laws"}
              </span>
              <span style={{
                fontSize: '11px',
                fontWeight: 600,
                color: 'var(--google-blue)',
                backgroundColor: 'var(--google-blue-light)',
                padding: '2px 8px',
                borderRadius: '12px'
              }}>
                {session.room_code || 'ROOM304'}
              </span>
            </div>
            <div style={{ fontSize: '12px', color: 'var(--google-green)', fontWeight: 500, display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: 'var(--google-green)' }} />
              Live Synchronized Student View
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button
            className="btn-google-outline"
            onClick={() => setIsCalibModalOpen(true)}
            style={{ fontSize: '12px', padding: '6px 14px' }}
          >
            {cameraEnabled ? <Eye size={15} /> : <EyeOff size={15} />}
            <span>{cameraEnabled ? 'Gaze Active' : 'Enable Eye Tracking'}</span>
          </button>

          <UserAvatar name={session.display_name || 'Alex Rivera'} size={34} />

          {onBack && (
            <button className="btn-google-text" onClick={onBack}>
              <ArrowLeft size={16} /> Exit
            </button>
          )}
        </div>
      </header>

      {/* Main Student Workspace */}
      <main style={{ maxWidth: '900px', margin: '32px auto', padding: '0 16px' }}>
        
        {/* Active Slide Card */}
        <div className="gc-card" style={{ padding: '32px', marginBottom: '20px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text-muted)' }}>
              Slide {currentSlideIndex + 1} of {chunks.length || 1}
            </span>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleFlagDifficult}
                style={{
                  backgroundColor: flaggedBlocks[currentChunk?.chunk_id || 1] ? 'var(--google-red-light)' : 'var(--google-surface-variant)',
                  color: flaggedBlocks[currentChunk?.chunk_id || 1] ? 'var(--google-red-text)' : 'var(--text-body)',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Flag size={14} /> Flag Difficult
              </button>

              <button
                onClick={handleFlagImportant}
                style={{
                  backgroundColor: importantBlocks[currentChunk?.chunk_id || 1] ? 'var(--google-yellow-light)' : 'var(--google-surface-variant)',
                  color: importantBlocks[currentChunk?.chunk_id || 1] ? 'var(--google-orange-text)' : 'var(--text-body)',
                  border: 'none',
                  borderRadius: '16px',
                  padding: '6px 14px',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <Lightbulb size={14} /> Mark Important
              </button>
            </div>
          </div>

          {currentChunk && (
            <div style={{ borderLeft: '4px solid var(--google-blue)', paddingLeft: '20px' }}>
              <h2 style={{ fontSize: '22px', fontWeight: 500, color: 'var(--text-dark)', marginBottom: '12px' }}>
                {currentChunk.title}
              </h2>
              <p style={{ fontSize: '15px', lineHeight: 1.6, color: 'var(--text-body)' }}>
                {currentChunk.text}
              </p>
            </div>
          )}
        </div>

        {/* Gemma AI Simplified Explanation stream */}
        {(activeReiteration || currentChunk?.simplified_text) && (
          <div className="gc-card animate-slide-up" style={{
            borderLeft: '5px solid var(--google-green)',
            padding: '20px 24px',
            backgroundColor: 'var(--google-green-light)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--google-green-text)', fontWeight: 600, fontSize: '14px', marginBottom: '8px' }}>
              <Sparkles size={16} /> Gemma AI Simplified Pedagogical Explanation
            </div>
            <p style={{ fontSize: '14px', color: 'var(--google-green-text)', lineHeight: 1.6, margin: 0 }}>
              💡 {activeReiteration || currentChunk.simplified_text}
            </p>
          </div>
        )}
      </main>

      <CalibrationModal 
        isOpen={isCalibModalOpen}
        onClose={() => setIsCalibModalOpen(false)}
        onCalibrationComplete={() => setCameraEnabled(true)}
      />
    </div>
  );
}
