/**
 * FocusAI — SPA Router & Application Shell
 *
 * Handles:
 * - View routing (auth / teacher-dash / student-dash / classroom)
 * - Auth state management (persist session, auto-redirect)
 * - Teacher class management (create, list)
 * - Student class management (join, list)
 * - Toast notifications
 * - Connection status
 */

import { getSupabase, getSession, getAccessToken, onAuthStateChange } from './supabase-client.js';
import { initClassroom } from './classroom.js';

// ─── State ────────────────────────────────────────────────────────────────────
const state = {
  user: null,       // Supabase user
  profile: null,    // { role, full_name, avatar_url }
  currentView: null,
};

// ─── View IDs ─────────────────────────────────────────────────────────────────
const VIEWS = {
  auth:             document.getElementById('authView'),
  teacher:          document.getElementById('teacherDashView'),
  student:          document.getElementById('studentDashView'),
  classroomTeacher: document.getElementById('classroomTeacherView'),
  classroomStudent: document.getElementById('classroomStudentView'),
};

// ─── Toast ────────────────────────────────────────────────────────────────────
const $toast = document.getElementById('toast');
let toastTimeout;

function showToast(message, type = 'default') {
  $toast.textContent = message;
  $toast.className = `toast show${type !== 'default' ? ' ' + type : ''}`;
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => $toast.classList.remove('show'), 3500);
}

// ─── Spinner Helpers ──────────────────────────────────────────────────────────
function setButtonLoading(btn, labelEl, loading, label) {
  btn.disabled = loading;
  if (loading) {
    labelEl.innerHTML = '<div class="spinner"></div>';
  } else {
    labelEl.textContent = label;
  }
}

// ─── API Helper ───────────────────────────────────────────────────────────────
async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const res = await fetch(`/api/v1${path}`, { ...options, headers });
  const body = await res.json();

  if (!res.ok) {
    const err = new Error(body?.error?.message || `Request failed (${res.status})`);
    err.code = body?.error?.code;
    err.status = res.status;
    throw err;
  }

  return body.data;
}

// ─── Navigation ───────────────────────────────────────────────────────────────
function navigate(viewKey) {
  Object.values(VIEWS).forEach(v => v?.classList.remove('active'));
  const target = VIEWS[viewKey];
  if (target) {
    target.classList.add('active');
    state.currentView = viewKey;
    // Update URL hash (simple hash-based routing)
    history.pushState({ view: viewKey }, '', `#${viewKey}`);
  }
}

// Make navigate available globally for inline onclick in HTML placeholders
window.app = { navigate };

// ─── Auth State ───────────────────────────────────────────────────────────────
async function fetchProfile() {
  try {
    const profile = await apiFetch('/auth/me');
    return profile?.user || null;
  } catch {
    return null;
  }
}

async function handleAuthState(user) {
  if (!user) {
    state.user = null;
    state.profile = null;
    navigate('auth');
    return;
  }

  state.user = user;
  const profileData = await fetchProfile();

  if (!profileData) {
    // Profile missing — sign out cleanly
    const sb = await getSupabase();
    await sb.auth.signOut();
    navigate('auth');
    return;
  }

  state.profile = profileData;

  if (profileData.role === 'teacher') {
    updateTeacherUI(profileData);
    await loadTeacherClasses();
    navigate('teacher');
  } else {
    updateStudentUI(profileData);
    await loadStudentClasses();
    navigate('student');
  }
}

// ─── Auth Forms ───────────────────────────────────────────────────────────────

// Tab switching
const tabSignin = document.getElementById('tabSignin');
const tabSignup = document.getElementById('tabSignup');
const signinPanel = document.getElementById('signinPanel');
const signupPanel = document.getElementById('signupPanel');

tabSignin.addEventListener('click', () => {
  tabSignin.classList.add('active'); tabSignin.setAttribute('aria-selected', 'true');
  tabSignup.classList.remove('active'); tabSignup.setAttribute('aria-selected', 'false');
  signinPanel.style.display = '';
  signupPanel.style.display = 'none';
});

tabSignup.addEventListener('click', () => {
  tabSignup.classList.add('active'); tabSignup.setAttribute('aria-selected', 'true');
  tabSignin.classList.remove('active'); tabSignin.setAttribute('aria-selected', 'false');
  signupPanel.style.display = '';
  signinPanel.style.display = 'none';
});

// Role selector (signup)
let selectedRole = 'teacher';
const roleCards = document.querySelectorAll('.role-card');
roleCards.forEach(card => {
  card.addEventListener('click', () => {
    roleCards.forEach(c => { c.classList.remove('selected'); c.setAttribute('aria-checked', 'false'); });
    card.classList.add('selected');
    card.setAttribute('aria-checked', 'true');
    selectedRole = card.dataset.role;
  });
  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
  });
});

// Sign In
const signinForm = document.getElementById('signinForm');
const signinBtn = document.getElementById('signinBtn');
const signinBtnLabel = document.getElementById('signinBtnLabel');

signinForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('signinEmail').value.trim();
  const password = document.getElementById('signinPassword').value;

  if (!email || !password) {
    showToast('Please enter your email and password.', 'error');
    return;
  }

  setButtonLoading(signinBtn, signinBtnLabel, true, 'Sign In');
  try {
    const data = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Store session in Supabase client (for auto-refresh)
    const sb = await getSupabase();
    await sb.auth.setSession({
      access_token: data.auth.access_token,
      refresh_token: data.auth.refresh_token,
    });
    localStorage.setItem('focusai_token', data.auth.access_token);

    showToast(`Welcome back, ${data.user.full_name}! 👋`, 'success');
    await handleAuthState({ id: data.user.id, email: data.user.email });
  } catch (err) {
    showToast(err.message || 'Sign in failed. Please try again.', 'error');
  } finally {
    setButtonLoading(signinBtn, signinBtnLabel, false, 'Sign In');
  }
});

// Sign Up
const signupForm = document.getElementById('signupForm');
const signupBtn = document.getElementById('signupBtn');
const signupBtnLabel = document.getElementById('signupBtnLabel');

signupForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const firstName = document.getElementById('signupFirst').value.trim();
  const lastName = document.getElementById('signupLast').value.trim();
  const email = document.getElementById('signupEmail').value.trim();
  const password = document.getElementById('signupPassword').value;
  const fullName = `${firstName} ${lastName}`.trim();

  if (!firstName || !email || !password) {
    showToast('Please fill in all required fields.', 'error');
    return;
  }

  if (password.length < 6) {
    showToast('Password must be at least 6 characters.', 'error');
    return;
  }

  setButtonLoading(signupBtn, signupBtnLabel, true, 'Create Account');
  try {
    await apiFetch('/auth/signup', {
      method: 'POST',
      body: JSON.stringify({ email, password, fullName, role: selectedRole }),
    });

    showToast('Account created! Signing you in…', 'success');

    // Auto sign in after signup
    const signinData = await apiFetch('/auth/signin', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    const sb = await getSupabase();
    await sb.auth.setSession({
      access_token: signinData.auth.access_token,
      refresh_token: signinData.auth.refresh_token,
    });

    await handleAuthState({ id: signinData.user.id, email: signinData.user.email });
  } catch (err) {
    showToast(err.message || 'Account creation failed. Please try again.', 'error');
  } finally {
    setButtonLoading(signupBtn, signupBtnLabel, false, 'Create Account');
  }
});

// ─── Teacher Dashboard ────────────────────────────────────────────────────────
function updateTeacherUI(profile) {
  document.getElementById('teacherName').textContent = profile.full_name || 'Teacher';
  const avatar = document.getElementById('teacherAvatar');
  if (profile.avatar_url) {
    avatar.innerHTML = `<img src="${profile.avatar_url}" alt="${profile.full_name}">`;
  } else {
    avatar.textContent = (profile.full_name || 'T')[0].toUpperCase();
  }
}

async function loadTeacherClasses() {
  const grid = document.getElementById('teacherClassesGrid');
  grid.innerHTML = renderLoadingSkeleton();

  try {
    const classes = await apiFetch('/classes');
    if (!classes?.length) {
      grid.innerHTML = renderEmptyState(
        '📋',
        'No classes yet',
        'Create your first class to start a live FocusAI session with your students.'
      );
      return;
    }
    grid.innerHTML = '';
    classes.forEach((cls, i) => {
      grid.appendChild(createClassCard(cls, 'teacher', i));
    });
  } catch (err) {
    grid.innerHTML = renderEmptyState('⚠️', 'Failed to load classes', err.message);
  }
}

// Teacher logout
document.getElementById('teacherLogoutBtn').addEventListener('click', logout);

// Create class button
document.getElementById('createClassBtn').addEventListener('click', () => {
  document.getElementById('createClassModal').classList.add('open');
  document.getElementById('classNameInput').focus();
});

// Create class form
const createClassForm = document.getElementById('createClassForm');
const createClassSubmitBtn = document.getElementById('createClassSubmitBtn');
const createClassBtnLabel = document.getElementById('createClassBtnLabel');

document.getElementById('createClassClose').addEventListener('click', () => {
  document.getElementById('createClassModal').classList.remove('open');
});

createClassForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = document.getElementById('classNameInput').value.trim();
  const subject = document.getElementById('classSubjectInput').value.trim();
  const expectedStudents = parseInt(document.getElementById('classExpectedInput').value) || 30;

  if (!name || !subject) {
    showToast('Class name and subject are required.', 'error');
    return;
  }

  setButtonLoading(createClassSubmitBtn, createClassBtnLabel, true, 'Create Class');
  try {
    const cls = await apiFetch('/classes', {
      method: 'POST',
      body: JSON.stringify({ name, subject, expectedStudents }),
    });
    document.getElementById('createClassModal').classList.remove('open');
    createClassForm.reset();
    showToast(`Class "${cls.name}" created! Code: ${cls.class_code}`, 'success');
    await loadTeacherClasses();
  } catch (err) {
    showToast(err.message || 'Failed to create class.', 'error');
  } finally {
    setButtonLoading(createClassSubmitBtn, createClassBtnLabel, false, 'Create Class');
  }
});

// ─── Upload Material Modal Handlers ───────────────────────────────────────────
const openUploadModalBtn = document.getElementById('openUploadModalBtn');
const uploadMaterialModal = document.getElementById('uploadMaterialModal');
const uploadMaterialClose = document.getElementById('uploadMaterialClose');
const uploadMaterialForm = document.getElementById('uploadMaterialForm');
const uploadClassSelect = document.getElementById('uploadClassSelect');
const uploadMaterialSubmitBtn = document.getElementById('uploadMaterialSubmitBtn');
const uploadMaterialBtnLabel = document.getElementById('uploadMaterialBtnLabel');

if (openUploadModalBtn) {
  openUploadModalBtn.addEventListener('click', async () => {
    try {
      const classes = await apiFetch('/classes');
      uploadClassSelect.innerHTML = '<option value="">Select a class…</option>' +
        (classes || []).map(c => `<option value="${c.id}">${escHtml(c.name)} (${c.subject})</option>`).join('');
      uploadMaterialModal.classList.add('open');
    } catch (err) {
      showToast('Failed to load classes for upload.', 'error');
    }
  });
}

if (uploadMaterialClose) {
  uploadMaterialClose.addEventListener('click', () => {
    uploadMaterialModal.classList.remove('open');
  });
}

if (uploadMaterialForm) {
  uploadMaterialForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const classId = uploadClassSelect.value;
    const fileInput = document.getElementById('materialFileInput');
    const file = fileInput.files?.[0];

    if (!classId) {
      showToast('Please select a class.', 'error');
      return;
    }
    if (!file) {
      showToast('Please select a file to upload.', 'error');
      return;
    }

    setButtonLoading(uploadMaterialSubmitBtn, uploadMaterialBtnLabel, true, 'Process & Extract Slides');
    try {
      const token = await getAccessToken();
      const formData = new FormData();
      formData.append('class_id', classId);
      formData.append('file', file);

      const res = await fetch('/api/v1/materials/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Upload failed');

      uploadMaterialModal.classList.remove('open');
      uploadMaterialForm.reset();
      showToast(`Material "${file.name}" processed! Extracted ${data.data?.total_pages || 0} slides.`, 'success');
    } catch (err) {
      showToast(err.message || 'Upload failed.', 'error');
    } finally {
      setButtonLoading(uploadMaterialSubmitBtn, uploadMaterialBtnLabel, false, 'Process & Extract Slides');
    }
  });
}

// ─── Student Dashboard ────────────────────────────────────────────────────────
function updateStudentUI(profile) {
  document.getElementById('studentName').textContent = profile.full_name || 'Student';
  const avatar = document.getElementById('studentAvatar');
  if (profile.avatar_url) {
    avatar.innerHTML = `<img src="${profile.avatar_url}" alt="${profile.full_name}">`;
  } else {
    avatar.textContent = (profile.full_name || 'S')[0].toUpperCase();
  }
}

async function loadStudentClasses() {
  const grid = document.getElementById('studentClassesGrid');
  grid.innerHTML = renderLoadingSkeleton();

  try {
    const classes = await apiFetch('/classes/my');
    if (!classes?.length) {
      grid.innerHTML = renderEmptyState(
        '📚',
        'No classes yet',
        'Ask your teacher for a class code to join a FocusAI classroom.'
      );
      return;
    }
    grid.innerHTML = '';
    classes.forEach((cls, i) => {
      grid.appendChild(createClassCard(cls, 'student', i));
    });
  } catch (err) {
    grid.innerHTML = renderEmptyState('⚠️', 'Failed to load classes', err.message);
  }
}

// Student logout
document.getElementById('studentLogoutBtn').addEventListener('click', logout);

// Join class button
document.getElementById('joinClassBtn').addEventListener('click', () => {
  document.getElementById('joinClassModal').classList.add('open');
  document.getElementById('joinCodeInput').focus();
});

// Join class form
const joinClassForm = document.getElementById('joinClassForm');
const joinClassSubmitBtn = document.getElementById('joinClassSubmitBtn');
const joinClassBtnLabel = document.getElementById('joinClassBtnLabel');

document.getElementById('joinClassClose').addEventListener('click', () => {
  document.getElementById('joinClassModal').classList.remove('open');
});

// Auto-uppercase join code input
document.getElementById('joinCodeInput').addEventListener('input', (e) => {
  const start = e.target.selectionStart;
  e.target.value = e.target.value.toUpperCase();
  e.target.setSelectionRange(start, start);
});

joinClassForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const code = document.getElementById('joinCodeInput').value.trim().toUpperCase();
  if (code.length !== 6) {
    showToast('Class codes are exactly 6 characters (e.g. MTH492).', 'error');
    return;
  }

  setButtonLoading(joinClassSubmitBtn, joinClassBtnLabel, true, 'Join Class');
  try {
    const result = await apiFetch('/classes/join', {
      method: 'POST',
      body: JSON.stringify({ class_code: code }),
    });
    document.getElementById('joinClassModal').classList.remove('open');
    joinClassForm.reset();
    showToast(result.message || `Joined "${result.class_name}"!`, 'success');
    await loadStudentClasses();
  } catch (err) {
    showToast(err.message || 'Failed to join class.', 'error');
  } finally {
    setButtonLoading(joinClassSubmitBtn, joinClassBtnLabel, false, 'Join Class');
  }
});

// ─── Class Card Renderer ──────────────────────────────────────────────────────
function createClassCard(cls, role, index) {
  const card = document.createElement('div');
  card.className = 'class-card animate-slide-up';
  card.style.animationDelay = `${index * 60}ms`;
  card.setAttribute('role', 'button');
  card.setAttribute('tabindex', '0');
  card.setAttribute('aria-label', `${cls.name} — ${cls.subject}`);

  const memberCount = cls.class_members?.[0]?.count ?? cls.member_count ?? '—';
  const teacherName = cls.teacher_name ? `by ${cls.teacher_name}` : '';

  card.innerHTML = `
    <div class="class-card-subject">${escHtml(cls.subject)}</div>
    <div class="class-card-name">${escHtml(cls.name)}</div>
    ${role === 'teacher' ? `<div class="class-card-code">${escHtml(cls.class_code)}</div>` : ''}
    <div class="class-card-meta">
      ${role === 'teacher'
        ? `<span>👥 ${memberCount} students</span>`
        : `<span>👩‍🏫 ${escHtml(teacherName)}</span>`
      }
      <span>📅 ${formatDate(cls.created_at || cls.enrolled_at)}</span>
      ${role === 'teacher' ? `<button class="btn btn-ghost class-history-btn" style="padding: 2px 8px; font-size: 11px; border: 1px solid var(--border); border-radius: 999px;">📊 History</button>` : ''}
    </div>
  `;

  const historyBtn = card.querySelector('.class-history-btn');
  if (historyBtn) {
    historyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showClassHistoryModal(cls.id, cls.name);
    });
  }

  card.addEventListener('click', async () => {
    try {
      showToast('Opening classroom...', 'default');
      let sessions = await apiFetch(`/sessions/class/${cls.id}`);
      let session = sessions && sessions.length > 0 ? sessions[0] : null;

      if (!session && role === 'teacher') {
        session = await apiFetch('/sessions', {
          method: 'POST',
          body: JSON.stringify({ class_id: cls.id }),
        });
        await apiFetch(`/sessions/${session.id}/start`, { method: 'POST' });
      }

      if (!session) {
        showToast('No active classroom session for this class yet.', 'default');
        return;
      }

      if (role === 'teacher') {
        navigate('classroomTeacher');
        await initClassroom(session.id, 'teacher');
      } else {
        navigate('classroomStudent');
        await initClassroom(session.id, 'student');
      }
    } catch (err) {
      showToast(err.message || 'Failed to enter classroom.', 'error');
    }
  });

  card.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); card.click(); }
  });

  return card;
}

// ─── Student Insights Dashboard Button ────────────────────────────────────────
const studentMyInsightsBtn = document.getElementById('studentMyInsightsBtn');
if (studentMyInsightsBtn) {
  studentMyInsightsBtn.addEventListener('click', async () => {
    try {
      const data = await apiFetch('/analytics/student/me');
      showStudentInsightsModal(data);
    } catch (err) {
      showToast(err.message || 'Failed to load insights.', 'error');
    }
  });
}

function showStudentInsightsModal(data) {
  const existing = document.querySelector('.student-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'student-modal-overlay';
  overlay.innerHTML = `
    <div class="student-modal">
      <div class="student-modal-header">
        <h3 style="margin: 0; font-size: 16px; color: #065f46; font-weight: 700;">
          🌟 My Learning Insights
        </h3>
        <button id="closeDashInsightsBtn" class="btn btn-ghost" style="font-size: 16px; padding: 4px 8px;">✕</button>
      </div>
      <div class="student-modal-body">
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-val">${data.summary.overallAccuracyPct}%</div>
            <div class="stat-sub">Overall Accuracy</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${data.summary.totalTestsCompleted}</div>
            <div class="stat-sub">Comprehension Checks</div>
          </div>
        </div>

        <div class="evidence-box">
          <div class="evidence-box-title">
            <span>Recent Comprehension Checks</span>
          </div>
          ${data.recentTests.length === 0 ? `
            <div style="font-size: 12px; color: #94a3b8;">No checks completed yet.</div>
          ` : data.recentTests.map(t => `
            <div style="border-bottom: 1px solid #e2e8f0; padding: 8px 0; font-size: 12px;">
              <div style="font-weight: 600;">${escHtml(t.question)}</div>
              <div style="display: flex; gap: 10px; margin-top: 4px; font-size: 11px;">
                <span style="font-weight: 700; color: ${t.isCorrect ? '#166534' : '#991b1b'}">
                  ${t.isCorrect ? '✅ Understood' : '❌ Needs Review'}
                </span>
                <span style="color: #64748b;">Confidence: ${t.confidence}/5</span>
                <span style="color: #065f46;">Class: ${escHtml(t.className || '')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#closeDashInsightsBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}

async function showClassHistoryModal(classId, className) {
  try {
    const historyData = await apiFetch(`/analytics/class/${classId}/history`);

    const existing = document.querySelector('.student-modal-overlay');
    if (existing) existing.remove();

    const overlay = document.createElement('div');
    overlay.className = 'student-modal-overlay';
    overlay.innerHTML = `
      <div class="student-modal">
        <div class="student-modal-header">
          <h3 style="margin: 0; font-size: 16px; color: #065f46; font-weight: 700;">
            📊 Class Historical Comparison — ${escHtml(className)}
          </h3>
          <button id="closeHistoryModalBtn" class="btn btn-ghost" style="font-size: 16px; padding: 4px 8px;">✕</button>
        </div>
        <div class="student-modal-body">
          <div style="font-size: 13px; color: #64748b; margin-bottom: 8px;">
            Total Sessions Conducted: <strong>${historyData.totalSessions}</strong>
          </div>
          <div style="display: flex; flex-direction: column; gap: 10px;">
            ${(historyData.history || []).map((s, i) => `
              <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px;">
                <div style="display: flex; justify-content: space-between; align-items: center;">
                  <strong style="color: #065f46; font-size: 13px;">Session #${i + 1} (${s.code || 'Active'})</strong>
                  <span style="font-size: 11px; text-transform: uppercase; font-weight: 700; color: ${s.status === 'active' ? '#166534' : '#64748b'};">
                    ${s.status}
                  </span>
                </div>
                <div style="display: flex; gap: 16px; margin-top: 6px; font-size: 12px; color: #475569;">
                  <span>Average Difficulty: <strong>${s.averageDifficultyPct}%</strong></span>
                  <span>Struggling Blocks: <strong style="color: ${s.difficultyDetectedBlocks > 0 ? '#b91c1c' : '#166534'}">${s.difficultyDetectedBlocks}</strong></span>
                  <span>Date: ${formatDate(s.date)}</span>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    overlay.querySelector('#closeHistoryModalBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  } catch (err) {
    showToast('Failed to load class history: ' + err.message, 'error');
  }
}


// ─── Logout ───────────────────────────────────────────────────────────────────
async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch { /* non-fatal */ }
  const sb = await getSupabase();
  await sb.auth.signOut();
  state.user = null;
  state.profile = null;
  navigate('auth');
  showToast('You have been signed out.', 'default');
}

// ─── Skeleton / Empty State Helpers ──────────────────────────────────────────
function renderLoadingSkeleton() {
  return Array.from({ length: 3 }).map(() => `
    <div class="class-card" style="opacity:0.5;animation:none;pointer-events:none" aria-hidden="true">
      <div style="background:var(--border);height:12px;border-radius:6px;width:40%;margin-bottom:10px"></div>
      <div style="background:var(--border);height:18px;border-radius:6px;width:75%;margin-bottom:12px"></div>
      <div style="background:var(--border);height:10px;border-radius:6px;width:30%;margin-bottom:16px"></div>
      <div style="background:var(--border);height:10px;border-radius:6px;width:60%"></div>
    </div>
  `).join('');
}

function renderEmptyState(icon, title, text) {
  return `
    <div class="empty-state" style="grid-column:1/-1">
      <div class="empty-state-icon">${icon}</div>
      <div class="empty-state-title">${escHtml(title)}</div>
      <p class="empty-state-text">${escHtml(text)}</p>
    </div>
  `;
}

// ─── Utilities ────────────────────────────────────────────────────────────────
function escHtml(str) {
  return (str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function formatDate(isoStr) {
  if (!isoStr) return '';
  try {
    return new Intl.DateTimeFormat('en', { month: 'short', day: 'numeric', year: 'numeric' }).format(new Date(isoStr));
  } catch { return ''; }
}

// Close modals on overlay click
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// Keyboard: close modals on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-overlay.open').forEach(m => m.classList.remove('open'));
  }
});

// Handle browser back/forward
window.addEventListener('popstate', (e) => {
  const view = e.state?.view;
  if (view && VIEWS[view]) navigate(view);
});

// ─── Connection Status ────────────────────────────────────────────────────────
const $banner = document.getElementById('connectionBanner');
window.addEventListener('offline', () => {
  $banner.textContent = '⚠️ No internet connection';
  $banner.className = 'connection-banner show offline';
});
window.addEventListener('online', () => {
  $banner.textContent = '✅ Connection restored';
  $banner.className = 'connection-banner show';
  setTimeout(() => $banner.classList.remove('show'), 2500);
});

// ─── Bootstrap ────────────────────────────────────────────────────────────────
async function bootstrap() {
  // Start on auth view while checking session
  navigate('auth');

  try {
    const session = await getSession();
    if (session?.user) {
      if (session.access_token) {
        localStorage.setItem('focusai_token', session.access_token);
      }
      await handleAuthState(session.user);
    } else {
      navigate('auth');
    }
  } catch (err) {
    console.error('[FocusAI] Bootstrap error:', err.message);
    navigate('auth');
    // Show a non-blocking warning if Supabase is not configured
    if (err.message?.includes('configuration')) {
      showToast('⚠️ Server not fully configured. See .env setup.', 'error');
    }
  }

  // Listen for Supabase auth state changes (token refresh, signout from another tab)
  onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_OUT') {
      state.user = null;
      state.profile = null;
      navigate('auth');
    } else if (event === 'TOKEN_REFRESHED' && session?.user) {
      // Silently update — no navigation needed
    }
  });
}

bootstrap();
