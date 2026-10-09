import React, { useState, useEffect } from 'react';
import Login from './pages/Login';
import ClassroomHome from './pages/ClassroomHome';
import TeacherDashboard from './pages/TeacherDashboard';
import StudentView from './pages/StudentView';
import TeacherUpload from './pages/TeacherUpload';
import StudentJoin from './pages/StudentJoin';

export default function App() {
  // Page states: 'login' | 'classroom-home' | 'teacher-dashboard' | 'student-view' | 'teacher-upload' | 'student-join'
  const [currentPage, setCurrentPage] = useState('classroom-home');
  const [user, setUser] = useState({
    name: 'M Deemanth',
    email: 'deemanth@university.edu',
    role: 'teacher'
  });
  const [sessionData, setSessionData] = useState({
    room_code: 'ROOM304',
    title: "Physics 101 — Newton's Laws",
    document_id: 1,
    student_id: 1,
    display_name: 'Prof. Harrison'
  });

  useEffect(() => {
    const cached = localStorage.getItem('clariclass_user');
    if (cached) {
      try {
        const u = JSON.parse(cached);
        setUser(u);
        setCurrentPage('classroom-home');
      } catch (e) {}
    }
  }, []);

  const handleLoginSuccess = (userData) => {
    setUser(userData);
    setCurrentPage('classroom-home');
  };

  const handleLogout = () => {
    localStorage.removeItem('clariclass_token');
    localStorage.removeItem('clariclass_user');
    setUser(null);
    setCurrentPage('login');
  };

  const handleSelectClass = (selectedClass) => {
    setSessionData(prev => ({
      ...prev,
      title: selectedClass.title,
      room_code: selectedClass.roomCode || 'ROOM304'
    }));
    setCurrentPage('teacher-dashboard');
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      
      {/* Main Routed Page */}
      <div style={{ flex: 1 }}>
        {currentPage === 'login' && (
          <Login onLoginSuccess={handleLoginSuccess} />
        )}

        {currentPage === 'classroom-home' && (
          <ClassroomHome 
            user={user}
            onSelectClass={handleSelectClass}
            onLogout={handleLogout}
          />
        )}

        {currentPage === 'teacher-dashboard' && (
          <TeacherDashboard 
            sessionData={sessionData}
            onUploadClick={() => setCurrentPage('teacher-upload')}
            onEndSession={handleLogout}
            onGoHome={() => setCurrentPage('classroom-home')}
          />
        )}

        {currentPage === 'student-view' && (
          <StudentView 
            sessionData={sessionData} 
            onBack={() => setCurrentPage('classroom-home')}
          />
        )}

        {currentPage === 'teacher-upload' && (
          <TeacherUpload 
            onSessionCreated={(res) => { setSessionData(res); setCurrentPage('teacher-dashboard'); }}
            onBack={() => setCurrentPage('teacher-dashboard')}
          />
        )}

        {currentPage === 'student-join' && (
          <StudentJoin 
            onJoinSuccess={(res) => { setSessionData(res); setCurrentPage('student-view'); }}
            onBack={() => setCurrentPage('classroom-home')}
          />
        )}
      </div>

    </div>
  );
}
