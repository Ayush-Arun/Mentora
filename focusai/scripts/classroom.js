/**
 * FocusAI — Live Classroom Controller
 * Handles slide rendering, authoritative teacher navigation,
 * student slide sync, paragraph feedback, multimodal difficulty tracking,
 * live comprehension quizzes, and pedagogical reiteration broadcasting.
 */
import { getSupabaseClient, getAccessToken } from './supabase-client.js';
import { initEyeTracking, promptCameraConsent } from './calibration.js';

let activeSessionId = null;
let currentRole = null;
let currentSlideIndex = 0;
let totalSlides = 0;
let materialData = null;
let syncTimer = null;
let realtimeChannel = null;

// Phase 4: Analytics, Quiz, and Reiteration State
let difficultyMap = new Map(); // content_block_id -> difficulty assessment
let activeReiterationProposal = null;
let answeredTestIds = new Set();
let currentRecommendedQuestion = null;

async function getAuthToken() {
  try {
    const t = await getAccessToken();
    if (t) return t;
  } catch (e) {}
  return localStorage.getItem('focusai_token');
}

/**
 * Initialize live classroom session.
 */
export async function initClassroom(sessionId, role) {
  activeSessionId = sessionId;
  currentRole = role;

  // Cleanup prior listeners
  if (syncTimer) clearInterval(syncTimer);
  if (realtimeChannel) {
    try {
      const supabase = await getSupabaseClient();
      supabase.removeChannel(realtimeChannel);
    } catch (e) {}
  }

  // Load initial session state
  await fetchSessionData();

  // Initialize privacy-conscious eye tracking for students
  if (currentRole === 'student') {
    initEyeTracking(activeSessionId);
  }

  // Set up Supabase Realtime channel
  setupRealtimeSubscription();

  // Set up sync polling fallback for bulletproof state reconciliation
  syncTimer = setInterval(reconcileSessionState, 3000);
}

/**
 * Fetch full session state & materials from server.
 */
async function fetchSessionData() {
  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`/api/v1/sessions/${activeSessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (!data || !data.session) return;

    materialData = data.material;
    currentSlideIndex = data.session.current_slide_index || 0;
    totalSlides = materialData?.pages?.length || 1;

    if (currentRole === 'teacher') {
      await fetchDifficultyAssessments();
      await fetchReiterationProposals();
    } else {
      await checkActiveTests();
      await checkBroadcastEvents();
    }

    renderClassroomView();
    if (currentRole === 'teacher') {
      fetchFeedbackSummary();
    }
  } catch (err) {
    console.error('Failed to load session:', err);
  }
}

/**
 * Subscribe to live session updates via Supabase Realtime.
 */
async function setupRealtimeSubscription() {
  try {
    const supabase = await getSupabaseClient();
    realtimeChannel = supabase
      .channel(`session:${activeSessionId}`)
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'sessions',
        filter: `id=eq.${activeSessionId}`,
      }, (payload) => {
        if (payload.new && payload.new.current_slide_index !== undefined) {
          if (payload.new.current_slide_index !== currentSlideIndex) {
            currentSlideIndex = payload.new.current_slide_index;
            renderCurrentSlide();
          }
        }
      })
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'session_events',
        filter: `session_id=eq.${activeSessionId}`,
      }, (payload) => {
        handleIncomingSessionEvent(payload.new);
      })
      .subscribe();
  } catch (err) {
    console.warn('Realtime subscription fallback to polling:', err);
  }
}

/**
 * Handle incoming Realtime session events.
 */
function handleIncomingSessionEvent(evt) {
  if (!evt) return;

  if (evt.event_type === 'COMPREHENSION_TEST_LAUNCHED') {
    if (currentRole === 'student') {
      openStudentQuizModal(evt.payload);
    }
  } else if (evt.event_type === 'REITERATION_PROPOSED') {
    if (currentRole === 'teacher') {
      fetchReiterationProposals();
    }
  } else if (evt.event_type === 'REITERATION_BROADCAST') {
    if (currentRole === 'student') {
      displayStudentBroadcast(evt.payload);
    }
  }
}

/**
 * Reconcile session state with server (authoritative sync).
 */
async function reconcileSessionState() {
  if (!activeSessionId) return;
  const token = await getAuthToken();
  if (!token) return;

  try {
    const res = await fetch(`/api/v1/sessions/${activeSessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data?.session) {
      if (data.session.current_slide_index !== currentSlideIndex) {
        currentSlideIndex = data.session.current_slide_index;
        renderCurrentSlide();
      }
      if (currentRole === 'teacher') {
        fetchFeedbackSummary();
        fetchDifficultyAssessments();
        fetchReiterationProposals();
      } else {
        checkActiveTests();
        checkBroadcastEvents();
      }
    }
  } catch (err) {
    // Non-blocking sync error
  }
}

/**
 * Fetch multimodal difficulty assessments for session.
 */
async function fetchDifficultyAssessments() {
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/v1/analytics/session/${activeSessionId}/difficulty`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data?.assessments) {
      difficultyMap.clear();
      data.assessments.forEach(a => difficultyMap.set(a.content_block_id, a));
      updateDifficultyBadgesOnScreen();
    }
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Fetch pending reiteration proposals for teacher.
 */
async function fetchReiterationProposals() {
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/v1/analytics/session/${activeSessionId}/reiterations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data) {
      const pending = data.find(r => r.status === 'proposed');
      activeReiterationProposal = pending || null;
      renderReiterationBanner();
    }
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Check for active comprehension tests (student view).
 */
async function checkActiveTests() {
  if (currentRole !== 'student' || !activeSessionId) return;
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/v1/tests/session/${activeSessionId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data && data.length > 0) {
      const unasked = data.find(t => !answeredTestIds.has(t.id));
      if (unasked && !document.querySelector('.quiz-modal-overlay')) {
        openStudentQuizModal(unasked);
      }
    }
  } catch (e) {}
}

/**
 * Check for recent broadcast events (student view).
 */
async function checkBroadcastEvents() {
  if (currentRole !== 'student' || !activeSessionId) return;
  const token = await getAuthToken();
  if (!token) return;
  try {
    const res = await fetch(`/api/v1/analytics/session/${activeSessionId}/reiterations`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (data && data.length > 0) {
      const broadcasted = data.find(r => r.status === 'broadcast' || r.status === 'approved');
      if (broadcasted && !document.getElementById('studentBroadcastBox')) {
        let expl = null;
        try {
          expl = broadcasted.teacher_edited_explanation
            ? { text: broadcasted.teacher_edited_explanation }
            : JSON.parse(broadcasted.ai_explanation);
        } catch {
          expl = { text: broadcasted.teacher_edited_explanation || broadcasted.ai_explanation };
        }
        displayStudentBroadcast({
          explanation: expl,
          concept_text: broadcasted.content_blocks?.text,
        });
      }
    }
  } catch (e) {}
}

/**
 * Render the full classroom view interface.
 */
function renderClassroomView() {
  const container = document.getElementById(
    currentRole === 'teacher' ? 'classroomTeacherView' : 'classroomStudentView'
  );
  if (!container) return;

  const className = materialData?.file_name ? materialData.file_name.replace(/\.[^/.]+$/, '') : 'Live Session';

  container.innerHTML = `
    <div class="classroom-container">
      <header class="classroom-header">
        <div class="classroom-title-group">
          <button id="leaveClassroomBtn" class="btn btn-ghost" style="padding: 6px 12px; font-size: 13px;">
            ← Leave
          </button>
          <h2 style="font-size: 18px; font-weight: 700; color: #065f46; margin: 0;">${className}</h2>
          <span class="classroom-status-pill live">
            <span class="pulse-dot"></span> Live
          </span>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          ${currentRole === 'student' ? `
            <button id="studentInsightsBtn" class="btn btn-ghost" style="font-size: 12px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid rgba(6, 95, 70, 0.2); padding: 5px 12px; border-radius: 999px;">
              🌟 My Insights
            </button>
            <button id="eyeTrackingConsentBtn" class="btn btn-ghost" style="font-size: 12px; display: inline-flex; align-items: center; gap: 5px; border: 1px solid rgba(6, 95, 70, 0.2); padding: 5px 12px; border-radius: 999px;">
              👁️ Eye Tracking (Calibrate)
            </button>
          ` : ''}
          <div style="font-size: 13px; color: #64748b; font-weight: 500;">
            Role: <strong style="color: #065f46; text-transform: capitalize;">${currentRole}</strong>
          </div>
        </div>
      </header>

      <div class="classroom-body">
        <main class="slide-stage">
          <!-- Teacher Reiteration Proposal Banner -->
          <div id="reiterationBannerContainer" style="width: 100%; max-width: 960px;"></div>

          <div id="slideViewport" class="slide-viewport">
            <!-- Slide contents dynamically inserted here -->
          </div>

          ${currentRole === 'teacher' ? `
            <div class="slide-toolbar">
              <button id="prevSlideBtn" class="slide-nav-btn">← Prev</button>
              <span id="slideCounter" class="slide-counter">1 / ${totalSlides}</span>
              <button id="nextSlideBtn" class="slide-nav-btn">Next →</button>
            </div>
          ` : `
            <div class="slide-toolbar" style="background: rgba(255,255,255,0.7);">
              <span style="font-size: 12px; color: #065f46; font-weight: 600;">
                🔒 Synchronized to Teacher's Screen
              </span>
              <span id="slideCounter" class="slide-counter">1 / ${totalSlides}</span>
            </div>
          `}
        </main>

        <aside class="classroom-sidebar">
          ${currentRole === 'teacher' ? `
            <div class="sidebar-tabs">
              <button id="tabFeedbackBtn" class="sidebar-tab-btn active">
                💬 Feedback <span id="confusionBadge" style="font-size: 10px; padding: 2px 6px; border-radius: 999px; background: #fee2e2; color: #991b1b;">0</span>
              </button>
              <button id="tabAiBtn" class="sidebar-tab-btn">
                ✨ AI Copilot
              </button>
              <button id="tabAnalyticsBtn" class="sidebar-tab-btn">
                📊 Analytics
              </button>
            </div>

            <div id="feedbackTabPanel" class="feedback-stream">
              <div id="feedbackStream">
                <div style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 40px;">
                  No questions or confusion submitted yet.
                </div>
              </div>
            </div>

            <div id="aiTabPanel" class="ai-insights-panel" style="display: none;">
              <!-- Grounded Slide Summary -->
              <div class="ai-card">
                <div class="ai-card-header">
                  <div class="ai-card-title">📝 Slide Summary</div>
                  <button id="refreshSummaryBtn" class="ai-action-btn">✨ Summarize</button>
                </div>
                <div id="aiSummaryBox" class="ai-summary-text">
                  Click 'Summarize' to generate a grounded explanation for this slide.
                </div>
              </div>

              <!-- Key Concepts -->
              <div class="ai-card">
                <div class="ai-card-header">
                  <div class="ai-card-title">💡 Core Concepts</div>
                  <button id="extractConceptsBtn" class="ai-action-btn">🔍 Extract</button>
                </div>
                <div id="aiConceptsBox" class="concepts-container">
                  <div style="font-size: 12px; color: #64748b;">Click 'Extract' to identify key concepts and definitions.</div>
                </div>
              </div>

              <!-- Quick Check Question -->
              <div class="ai-card" id="aiCheckQuestionCard" style="display: none;">
                <div class="ai-card-header">
                  <div class="ai-card-title">🎯 Check Understanding</div>
                </div>
                <div id="aiCheckQuestionText" style="font-size: 12px; font-weight: 600; color: #1e293b; margin-bottom: 6px;"></div>
                <div id="aiCheckQuestionOptions" style="display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: #475569;"></div>
                <button id="launchLiveQuizBtn" class="btn-primary" style="margin-top: 10px; width: 100%; font-size: 12px; padding: 7px 10px; border-radius: 8px;">
                  🚀 Launch as Live Student Quiz
                </button>
              </div>

              <!-- Alternative Explanations -->
              <div class="ai-card">
                <div class="ai-card-header">
                  <div class="ai-card-title">⚡ Re-Explanation Copilot</div>
                </div>
                <p style="font-size: 12px; color: #64748b; margin-bottom: 8px;">
                  Generate 3 distinct explanations (Analogy, Steps, Real-World) for this slide or confused students.
                </p>
                <button id="generateAlternativesBtn" class="btn-primary" style="width: 100%; font-size: 12px; padding: 8px 12px; border-radius: 8px;">
                  ✨ Generate 3 Alternatives
                </button>
              </div>
            </div>

            <!-- Group & Individual Analytics Tab Panel (Phase 5) -->
            <div id="analyticsTabPanel" class="analytics-panel" style="display: none;"></div>
          ` : `
            <div class="sidebar-tab-header">
              <span>Session Interactions</span>
            </div>
            <div id="feedbackStream" class="feedback-stream">
              <div style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 40px;">
                Ask questions or flag confusion using the buttons below.
              </div>
            </div>
            <div class="student-action-bar">
              <button id="quickConfusedBtn" class="quick-btn confused">
                😕 I'm Confused
              </button>
              <button id="quickQuestionBtn" class="quick-btn question">
                ❓ Ask Question
              </button>
            </div>
          `}
        </aside>
      </div>
    </div>
  `;

  // Attach leave button
  const leaveBtn = container.querySelector('#leaveClassroomBtn');
  if (leaveBtn) {
    leaveBtn.addEventListener('click', () => {
      if (syncTimer) clearInterval(syncTimer);
      window.location.hash = currentRole === 'teacher' ? '#teacher' : '#student';
    });
  }

  // Teacher navigation & tabs
  if (currentRole === 'teacher') {
    const prevBtn = container.querySelector('#prevSlideBtn');
    const nextBtn = container.querySelector('#nextSlideBtn');

    if (prevBtn) prevBtn.addEventListener('click', () => changeSlide(currentSlideIndex - 1));
    if (nextBtn) nextBtn.addEventListener('click', () => changeSlide(currentSlideIndex + 1));

    const tabFeedbackBtn = container.querySelector('#tabFeedbackBtn');
    const tabAiBtn = container.querySelector('#tabAiBtn');
    const tabAnalyticsBtn = container.querySelector('#tabAnalyticsBtn');
    const feedbackTabPanel = container.querySelector('#feedbackTabPanel');
    const aiTabPanel = container.querySelector('#aiTabPanel');
    const analyticsTabPanel = container.querySelector('#analyticsTabPanel');

    function selectTab(btn, panel) {
      [tabFeedbackBtn, tabAiBtn, tabAnalyticsBtn].forEach(b => b?.classList.remove('active'));
      [feedbackTabPanel, aiTabPanel, analyticsTabPanel].forEach(p => { if (p) p.style.display = 'none'; });
      btn.classList.add('active');
      panel.style.display = 'flex';
    }

    if (tabFeedbackBtn && tabAiBtn && tabAnalyticsBtn) {
      tabFeedbackBtn.addEventListener('click', () => selectTab(tabFeedbackBtn, feedbackTabPanel));
      tabAiBtn.addEventListener('click', () => selectTab(tabAiBtn, aiTabPanel));
      tabAnalyticsBtn.addEventListener('click', () => {
        selectTab(tabAnalyticsBtn, analyticsTabPanel);
        loadClassroomAnalytics();
      });
    }

    const refreshSummaryBtn = container.querySelector('#refreshSummaryBtn');
    if (refreshSummaryBtn) {
      refreshSummaryBtn.addEventListener('click', () => triggerSlideSummary());
    }

    const extractConceptsBtn = container.querySelector('#extractConceptsBtn');
    if (extractConceptsBtn) {
      extractConceptsBtn.addEventListener('click', () => triggerConceptExtraction());
    }

    const generateAlternativesBtn = container.querySelector('#generateAlternativesBtn');
    if (generateAlternativesBtn) {
      generateAlternativesBtn.addEventListener('click', () => triggerAlternativeExplanation());
    }
  }

  // Student actions
  if (currentRole === 'student') {
    const confusedBtn = container.querySelector('#quickConfusedBtn');
    const questionBtn = container.querySelector('#quickQuestionBtn');

    if (confusedBtn) {
      confusedBtn.addEventListener('click', () => submitQuickFeedback('confused'));
    }
    if (questionBtn) {
      questionBtn.addEventListener('click', () => promptQuestionFeedback());
    }

    const eyeBtn = container.querySelector('#eyeTrackingConsentBtn');
    if (eyeBtn) {
      eyeBtn.addEventListener('click', () => {
        promptCameraConsent((score) => {
          showToast(`Eye tracking calibrated! Accuracy: ${Math.round(score * 100)}%`, 'success');
          eyeBtn.style.background = '#ecfdf5';
          eyeBtn.style.color = '#065f46';
          eyeBtn.innerHTML = `👁️ Calibrated (${Math.round(score * 100)}%)`;
        });
      });
    }

    const insightsBtn = container.querySelector('#studentInsightsBtn');
    if (insightsBtn) {
      insightsBtn.addEventListener('click', () => openStudentPersonalInsightsModal());
    }
  }


  renderCurrentSlide();
  renderReiterationBanner();
}

/**
 * Render the current authoritative slide content.
 */
function renderCurrentSlide() {
  const viewport = document.getElementById('slideViewport');
  const counter = document.getElementById('slideCounter');
  if (!viewport) return;

  const pages = materialData?.pages || [];
  const activePage = pages[currentSlideIndex] || pages[0];

  if (counter) {
    counter.textContent = `${currentSlideIndex + 1} / ${Math.max(1, pages.length)}`;
  }

  if (currentRole === 'teacher') {
    const prevBtn = document.getElementById('prevSlideBtn');
    const nextBtn = document.getElementById('nextSlideBtn');
    if (prevBtn) prevBtn.disabled = currentSlideIndex <= 0;
    if (nextBtn) nextBtn.disabled = currentSlideIndex >= pages.length - 1;
  }

  if (!activePage) {
    viewport.innerHTML = `
      <div style="text-align: center; color: #64748b; margin-top: 100px;">
        <h3>No Slide Content Available</h3>
        <p>The teacher hasn't uploaded materials for this session yet.</p>
      </div>
    `;
    return;
  }

  let html = `
    <div class="slide-content-header">
      Slide ${activePage.page_number}
    </div>
  `;

  for (const block of activePage.blocks || []) {
    const isHeading = block.block_type === 'heading';

    // Phase 4: Multimodal Difficulty Assessment Badge
    let difficultyClass = '';
    let difficultyBadgeHtml = '';
    const assess = difficultyMap.get(block.id);
    if (assess && currentRole === 'teacher') {
      if (assess.status === 'difficulty_detected') {
        difficultyClass = 'difficulty-detected';
        difficultyBadgeHtml = `<span class="difficulty-badge difficulty-detected" title="Wrong answer rate: ${assess.evidence_sources?.comprehension?.rate || 0}%, Confused feedback: ${assess.evidence_sources?.feedback?.rate || 0}%">⚠️ ${assess.difficulty_pct}% Struggle (${assess.affected_count}/${assess.expected_count || assess.eligible_count} students)</span>`;
      } else if (assess.status === 'needs_attention') {
        difficultyClass = 'needs-attention';
        difficultyBadgeHtml = `<span class="difficulty-badge needs-attention">⚡ ${assess.difficulty_pct}% Difficulty</span>`;
      } else if (assess.status === 'monitoring') {
        difficultyBadgeHtml = `<span class="difficulty-badge monitoring">✓ Stable</span>`;
      }
    }

    html += `
      <div class="content-block ${isHeading ? 'slide-heading' : ''} ${difficultyClass} tracking-${block.tracking_status || 'available'}" 
           data-block-id="${block.id}" 
           title="${currentRole === 'student' ? 'Click to indicate confusion or ask a question' : 'Paragraph ID: ' + block.id}">
        <div style="font-weight: ${isHeading ? '700' : '400'}; font-size: ${isHeading ? '20px' : '16px'}; color: ${isHeading ? '#065f46' : '#1e293b'}">
          ${escapeHtml(block.text)}
        </div>
        <div class="content-block-meta">
          <span>§ Block ${block.block_index + 1}</span>
          ${block.tracking_status === 'available' ? '<span style="color: #059669;">• Tracking Active</span>' : ''}
          ${difficultyBadgeHtml}
        </div>
      </div>
    `;
  }

  viewport.innerHTML = html;

  // Student click on paragraph to send targeted feedback
  if (currentRole === 'student') {
    viewport.querySelectorAll('.content-block').forEach((el) => {
      el.addEventListener('click', () => {
        const blockId = el.getAttribute('data-block-id');
        promptBlockFeedback(blockId, el.textContent.trim());
      });
    });
  }
}

/**
 * Update difficulty badges dynamically without re-rendering entire slide.
 */
function updateDifficultyBadgesOnScreen() {
  if (currentRole !== 'teacher') return;
  const blocks = document.querySelectorAll('.content-block');
  blocks.forEach(el => {
    const blockId = el.getAttribute('data-block-id');
    const assess = difficultyMap.get(blockId);
    if (assess) {
      el.classList.remove('difficulty-detected', 'needs-attention');
      if (assess.status === 'difficulty_detected') el.classList.add('difficulty-detected');
      else if (assess.status === 'needs_attention') el.classList.add('needs-attention');

      let meta = el.querySelector('.content-block-meta');
      if (meta) {
        let badge = meta.querySelector('.difficulty-badge');
        if (!badge) {
          badge = document.createElement('span');
          meta.appendChild(badge);
        }
        badge.className = `difficulty-badge ${assess.status}`;
        badge.innerHTML = assess.status === 'difficulty_detected'
          ? `⚠️ ${assess.difficulty_pct}% Struggle (${assess.affected_count}/${assess.expected_count || assess.eligible_count} students)`
          : assess.status === 'needs_attention'
          ? `⚡ ${assess.difficulty_pct}% Difficulty`
          : `✓ Stable`;
      }
    }
  });
}

/**
 * Teacher changes slide (Authoritative).
 */
async function changeSlide(newIndex) {
  if (newIndex < 0 || (materialData?.pages && newIndex >= materialData.pages.length)) return;

  const token = await getAuthToken();
  try {
    const res = await fetch(`/api/v1/sessions/${activeSessionId}/slide`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ slide_index: newIndex }),
    });

    const { data } = await res.json();
    if (data) {
      currentSlideIndex = data.current_slide_index;
      renderCurrentSlide();
    }
  } catch (err) {
    console.error('Failed to change slide:', err);
  }
}

/**
 * Student submits quick confusion feedback.
 */
async function submitQuickFeedback(type, blockId = null, message = '') {
  const token = await getAuthToken();
  try {
    await fetch(`/api/v1/sessions/${activeSessionId}/feedback`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        feedback_type: type,
        content_block_id: blockId,
        message,
      }),
    });

    showToast('Feedback shared with teacher', 'success');
  } catch (err) {
    console.error('Failed to submit feedback:', err);
  }
}

/**
 * Student prompt for question on a paragraph.
 */
function promptBlockFeedback(blockId, snippet) {
  const message = prompt(`Ask a question or describe what is confusing about this section:\n"${snippet.substring(0, 80)}..."`);
  if (message && message.trim()) {
    submitQuickFeedback('question', blockId, message.trim());
  }
}

/**
 * Student general question prompt.
 */
function promptQuestionFeedback() {
  const message = prompt('Ask a question to the teacher:');
  if (message && message.trim()) {
    submitQuickFeedback('question', null, message.trim());
  }
}

/**
 * Teacher fetches real-time feedback summary.
 */
async function fetchFeedbackSummary() {
  const token = await getAuthToken();
  try {
    const res = await fetch(`/api/v1/sessions/${activeSessionId}/feedback`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const { data } = await res.json();
    if (!data) return;

    const badge = document.getElementById('confusionBadge');
    if (badge) {
      badge.textContent = `${data.counts.confused} Confused`;
    }

    const stream = document.getElementById('feedbackStream');
    if (!stream) return;

    if (!data.recent || data.recent.length === 0) {
      stream.innerHTML = `
        <div style="text-align: center; color: #94a3b8; font-size: 13px; margin-top: 40px;">
          No student questions submitted yet.
        </div>
      `;
      return;
    }

    stream.innerHTML = data.recent.map((f) => `
      <div class="feedback-card ${f.feedback_type}">
        <div class="feedback-author">
          ${escapeHtml(f.profiles?.full_name || 'Anonymous Student')} • <span style="text-transform: capitalize;">${f.feedback_type}</span>
        </div>
        <div class="feedback-body">${escapeHtml(f.message || 'Marked as confused by this slide')}</div>
        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 8px;">
          <div class="feedback-time">${new Date(f.created_at).toLocaleTimeString()}</div>
          ${(f.feedback_type === 'confused' || f.feedback_type === 'question') && currentRole === 'teacher' ? `
            <button class="ai-action-btn explain-btn" data-msg="${escapeHtml(f.message || '')}" data-block-id="${f.content_block_id || ''}">
              ✨ Explain with AI
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    stream.querySelectorAll('.explain-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const msg = btn.getAttribute('data-msg');
        const blockId = btn.getAttribute('data-block-id');
        triggerAlternativeExplanation(blockId, msg);
      });
    });
  } catch (err) {
    // Non-blocking
  }
}

/**
 * Trigger Grounded Slide Summary (Phase 3.3).
 */
async function triggerSlideSummary() {
  const box = document.getElementById('aiSummaryBox');
  const btn = document.getElementById('refreshSummaryBtn');
  const pages = materialData?.pages || [];
  const activePage = pages[currentSlideIndex] || pages[0];
  if (!activePage) return;

  if (btn) btn.disabled = true;
  if (box) box.innerHTML = '<em>🧠 Generating grounded AI summary...</em>';

  const token = await getAuthToken();
  try {
    const res = await fetch('/api/v1/ai/summary', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        material_id: materialData.id,
        page_id: activePage.id,
      }),
    });
    const { data } = await res.json();
    if (data?.summary) {
      box.textContent = data.summary;
    } else {
      box.textContent = 'Could not generate summary for this slide.';
    }
  } catch (err) {
    box.textContent = 'Error: ' + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Trigger Automated Concept Extraction & Important Flags (Phase 3.2).
 */
async function triggerConceptExtraction() {
  const box = document.getElementById('aiConceptsBox');
  const btn = document.getElementById('extractConceptsBtn');
  const checkCard = document.getElementById('aiCheckQuestionCard');
  const checkText = document.getElementById('aiCheckQuestionText');
  const checkOptions = document.getElementById('aiCheckQuestionOptions');
  const launchBtn = document.getElementById('launchLiveQuizBtn');

  const pages = materialData?.pages || [];
  const activePage = pages[currentSlideIndex] || pages[0];
  if (!activePage) return;

  if (btn) btn.disabled = true;
  if (box) box.innerHTML = '<em>🔍 Analyzing concepts & pedagogical importance...</em>';

  const token = await getAuthToken();
  try {
    const res = await fetch('/api/v1/ai/concepts', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        material_id: materialData.id,
        page_id: activePage.id,
      }),
    });
    const { data } = await res.json();
    if (data?.concepts && data.concepts.length > 0) {
      box.innerHTML = data.concepts.map(c => `
        <div class="concept-item">
          <div class="concept-item-top">
            <span class="concept-name">${escapeHtml(c.name)}</span>
            <span class="concept-badge ${c.importance || 'medium'}">${c.importance}</span>
          </div>
          <div class="concept-def">${escapeHtml(c.definition)}</div>
        </div>
      `).join('');

      // Render check question if provided
      if (data.recommendedCheckQuestion && checkCard && checkText && checkOptions) {
        currentRecommendedQuestion = data.recommendedCheckQuestion;
        checkText.textContent = data.recommendedCheckQuestion.question;
        checkOptions.innerHTML = (data.recommendedCheckQuestion.options || []).map((opt, i) => `
          <div><strong>${String.fromCharCode(65 + i)}.</strong> ${escapeHtml(opt)}</div>
        `).join('');
        checkCard.style.display = 'block';

        if (launchBtn) {
          launchBtn.textContent = '🚀 Launch as Live Student Quiz';
          launchBtn.disabled = false;
          launchBtn.onclick = () => {
            const firstBlockId = activePage.blocks?.[0]?.id || null;
            launchComprehensionQuiz(currentRecommendedQuestion, firstBlockId);
          };
        }
      }

      showToast(`Extracted ${data.concepts.length} concepts and flagged key blocks`, 'success');
    } else {
      box.innerHTML = '<div style="font-size: 12px; color: #64748b;">No distinct concepts extracted from this slide.</div>';
    }
  } catch (err) {
    box.textContent = 'Error: ' + err.message;
  } finally {
    if (btn) btn.disabled = false;
  }
}

/**
 * Teacher launches a live comprehension quiz (Phase 4).
 */
async function launchComprehensionQuiz(quizData, blockId = null) {
  if (!quizData) return;
  const launchBtn = document.getElementById('launchLiveQuizBtn');
  if (launchBtn) {
    launchBtn.disabled = true;
    launchBtn.textContent = 'Launching quiz...';
  }

  const token = await getAuthToken();
  try {
    const res = await fetch('/api/v1/tests', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: activeSessionId,
        content_block_id: blockId,
        question: quizData.question,
        options: quizData.options,
        correct_answer: quizData.options ? quizData.options[0] : null,
        test_type: 'mcq',
        source: 'ai_suggested',
      }),
    });
    const { data } = await res.json();
    if (data?.id) {
      showToast('🚀 Quiz launched live to students!', 'success');
      if (launchBtn) {
        launchBtn.textContent = '✅ Quiz Active (Receiving responses)';
      }
    }
  } catch (err) {
    showToast('Failed to launch quiz: ' + err.message, 'error');
    if (launchBtn) {
      launchBtn.disabled = false;
      launchBtn.textContent = '🚀 Launch as Live Student Quiz';
    }
  }
}

/**
 * Trigger Teacher Alternative Explanation Generator (Phase 3.4 & 4).
 */
async function triggerAlternativeExplanation(contentBlockId = null, studentConfusionNotes = '') {
  const pages = materialData?.pages || [];
  const activePage = pages[currentSlideIndex] || pages[0];
  if (!activePage) return;

  let conceptText = '';
  if (contentBlockId && activePage.blocks) {
    const block = activePage.blocks.find(b => b.id === contentBlockId);
    if (block) conceptText = block.text;
  }
  if (!conceptText) {
    conceptText = (activePage.blocks || []).map(b => b.text).join(' ');
  }

  showToast('🧠 Consulting AI Copilot for 3 pedagogical re-explanations...', 'info');

  const token = await getAuthToken();
  try {
    const res = await fetch('/api/v1/ai/reiterate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: activeSessionId,
        material_id: materialData.id,
        content_block_id: contentBlockId,
        concept_text: conceptText,
        student_confusion_notes: studentConfusionNotes,
      }),
    });

    const { data } = await res.json();
    if (data?.alternatives) {
      openReiterationModal(data.alternatives, conceptText.substring(0, 60), null, contentBlockId);
    } else {
      showToast('Could not generate alternatives.', 'error');
    }
  } catch (err) {
    showToast('Failed to generate explanations: ' + err.message, 'error');
  }
}

/**
 * Render Teacher Reiteration Proposal Banner when threshold triggered (Phase 4).
 */
function renderReiterationBanner() {
  const container = document.getElementById('reiterationBannerContainer');
  if (!container) return;

  if (!activeReiterationProposal) {
    container.innerHTML = '';
    return;
  }

  const p = activeReiterationProposal;
  let alts = null;
  try {
    alts = typeof p.ai_explanation === 'string' ? JSON.parse(p.ai_explanation) : p.ai_explanation;
  } catch (e) {
    alts = {};
  }

  container.innerHTML = `
    <div class="reiteration-alert-banner">
      <div class="reiteration-alert-text">
        <strong>⚠️ Class Struggle Alert: Reiteration Recommended</strong><br>
        <span>${p.affected_count} student(s) struggling with this section. AI has generated 3 pedagogical explanations for your review.</span>
      </div>
      <div style="display: flex; gap: 8px;">
        <button id="dismissProposalBtn" class="btn btn-ghost" style="font-size: 12px; padding: 6px 12px; background: rgba(0,0,0,0.05);">Dismiss</button>
        <button id="reviewProposalBtn" class="reiteration-alert-btn">✨ Review & Broadcast</button>
      </div>
    </div>
  `;

  const dismissBtn = container.querySelector('#dismissProposalBtn');
  if (dismissBtn) {
    dismissBtn.addEventListener('click', async () => {
      const token = await getAuthToken();
      await fetch(`/api/v1/analytics/session/${activeSessionId}/reiteration/${p.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'dismissed' }),
      });
      activeReiterationProposal = null;
      renderReiterationBanner();
    });
  }

  const reviewBtn = container.querySelector('#reviewProposalBtn');
  if (reviewBtn) {
    reviewBtn.addEventListener('click', () => {
      openReiterationModal(alts, p.content_blocks?.text || 'Classroom concept', p.id, p.content_block_id);
    });
  }
}

/**
 * Open Modal Displaying 3 Re-Explanation Alternatives (Phase 4 Teacher Broadcast).
 */
function openReiterationModal(alts, titleSnippet, reiterationId = null, blockId = null) {
  const existing = document.querySelector('.reiteration-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'reiteration-modal-overlay';
  overlay.innerHTML = `
    <div class="reiteration-modal">
      <div class="reiteration-modal-header">
        <div>
          <h3 style="margin: 0; font-size: 16px; color: #065f46; font-weight: 700;">
            ✨ Alternative Explanations Copilot
          </h3>
          <span style="font-size: 12px; color: #64748b;">Grounded in: "${escapeHtml(titleSnippet)}..."</span>
        </div>
        <button id="closeReiterationModal" class="btn btn-ghost" style="font-size: 18px; padding: 4px 8px;">✕</button>
      </div>

      <div class="reiteration-modal-body">
        <!-- 1. Analogy -->
        <div class="alternative-card">
          <div class="alternative-label">💡 Everyday Analogy</div>
          <div class="alternative-body">${escapeHtml(alts.analogy || 'Analogy not available')}</div>
          <div class="alternative-actions">
            <button class="ai-action-btn broadcast-alt-btn" data-type="analogy">📢 Broadcast to Students</button>
          </div>
        </div>

        <!-- 2. Step-by-Step Breakdown -->
        <div class="alternative-card">
          <div class="alternative-label">🪜 Step-by-Step Breakdown</div>
          <div class="alternative-body">
            ${Array.isArray(alts.step_by_step) ? alts.step_by_step.map(s => `<p style="margin: 4px 0;">${escapeHtml(s)}</p>`).join('') : escapeHtml(alts.step_by_step || '')}
          </div>
          <div class="alternative-actions">
            <button class="ai-action-btn broadcast-alt-btn" data-type="step_by_step">📢 Broadcast to Students</button>
          </div>
        </div>

        <!-- 3. Real-World Concrete Example -->
        <div class="alternative-card">
          <div class="alternative-label">🌍 Concrete Real-World Example</div>
          <div class="alternative-body">${escapeHtml(alts.concrete_example || 'Concrete example not available')}</div>
          <div class="alternative-actions">
            <button class="ai-action-btn broadcast-alt-btn" data-type="concrete_example">📢 Broadcast to Students</button>
          </div>
        </div>

        ${alts.quick_check_question ? `
          <div style="background: #f0fdf4; border: 1px dashed #10b981; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #065f46;">
            <strong>Suggested Question to Ask Class:</strong> "${escapeHtml(alts.quick_check_question)}"
          </div>
        ` : ''}
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#closeReiterationModal').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });

  // Broadcast handlers
  overlay.querySelectorAll('.broadcast-alt-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const type = btn.getAttribute('data-type');
      await executeReiterationBroadcast(type, alts, reiterationId, blockId);
      overlay.remove();
    });
  });
}

/**
 * Execute Reiteration Broadcast to students.
 */
async function executeReiterationBroadcast(type, alts, reiterationId = null, blockId = null) {
  const chosenText = type === 'analogy' ? alts.analogy
    : type === 'step_by_step' ? (Array.isArray(alts.step_by_step) ? alts.step_by_step.join('\n') : alts.step_by_step)
    : alts.concrete_example;

  const token = await getAuthToken();
  try {
    if (reiterationId) {
      await fetch(`/api/v1/analytics/session/${activeSessionId}/reiteration/${reiterationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ status: 'broadcast', teacher_edited_explanation: chosenText }),
      });
    }

    showToast(`Broadcasted ${type} explanation to students!`, 'success');
    activeReiterationProposal = null;
    renderReiterationBanner();
  } catch (err) {
    showToast('Failed to broadcast explanation: ' + err.message, 'error');
  }
}

/**
 * Student popover for interactive comprehension quiz (Phase 4).
 */
function openStudentQuizModal(test) {
  const testId = test.id || test.test_id;
  if (!test || !test.question || answeredTestIds.has(testId)) return;

  const existing = document.querySelector('.quiz-modal-overlay');
  if (existing) existing.remove();

  let selectedOption = null;
  let selectedConfidence = 3;
  const startTime = Date.now();

  const overlay = document.createElement('div');
  overlay.className = 'quiz-modal-overlay';
  overlay.innerHTML = `
    <div class="quiz-modal">
      <div class="quiz-modal-header">
        <div style="font-weight: 700; font-size: 15px; display: flex; align-items: center; gap: 8px;">
          <span>🎯 Quick Check Understanding</span>
        </div>
        <button id="closeQuizBtn" class="btn btn-ghost" style="color: white; font-size: 16px; padding: 2px 6px;">✕</button>
      </div>
      <div class="quiz-modal-body">
        <p style="font-size: 15px; font-weight: 600; color: #1e293b; margin: 0;">
          ${escapeHtml(test.question)}
        </p>

        <div class="quiz-options-list" id="quizOptionsList">
          ${(test.options || ['Option A', 'Option B', 'Option C', 'Option D']).map((opt, i) => `
            <button class="quiz-option-btn" data-opt="${escapeHtml(opt)}">
              <span style="font-weight: 700; color: #065f46;">${String.fromCharCode(65 + i)}.</span>
              <span>${escapeHtml(opt)}</span>
            </button>
          `).join('')}
        </div>

        <div class="confidence-selector">
          <label style="font-size: 12px; font-weight: 600; color: #475569;">How confident are you? (1 = Guessing, 5 = Very Sure):</label>
          <div class="confidence-buttons" id="confidenceButtons">
            <button class="confidence-btn" data-val="1">1 (Low)</button>
            <button class="confidence-btn" data-val="2">2</button>
            <button class="confidence-btn active" data-val="3">3 (Med)</button>
            <button class="confidence-btn" data-val="4">4</button>
            <button class="confidence-btn" data-val="5">5 (High)</button>
          </div>
        </div>

        <button id="submitQuizAnswerBtn" class="btn-primary" style="padding: 10px; border-radius: 8px; width: 100%; font-size: 14px;" disabled>
          Submit Answer
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);

  overlay.querySelector('#closeQuizBtn').addEventListener('click', () => overlay.remove());

  const optBtns = overlay.querySelectorAll('.quiz-option-btn');
  const submitBtn = overlay.querySelector('#submitQuizAnswerBtn');

  optBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      optBtns.forEach(b => b.classList.remove('selected'));
      btn.classList.add('selected');
      selectedOption = btn.getAttribute('data-opt');
      submitBtn.disabled = false;
    });
  });

  const confBtns = overlay.querySelectorAll('.confidence-btn');
  confBtns.forEach(b => {
    b.addEventListener('click', () => {
      confBtns.forEach(x => x.classList.remove('active'));
      b.classList.add('active');
      selectedConfidence = parseInt(b.getAttribute('data-val'), 10) || 3;
    });
  });

  submitBtn.addEventListener('click', async () => {
    if (!selectedOption) return;
    submitBtn.disabled = true;
    submitBtn.textContent = 'Submitting...';

    const token = await getAuthToken();
    try {
      await fetch(`/api/v1/tests/${testId}/respond`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          session_id: activeSessionId,
          selected_answer: selectedOption,
          confidence_rating: selectedConfidence,
          response_time_ms: Date.now() - startTime,
        }),
      });

      answeredTestIds.add(testId);
      overlay.querySelector('.quiz-modal-body').innerHTML = `
        <div style="text-align: center; padding: 24px 0;">
          <div style="font-size: 2.5rem; margin-bottom: 8px;">🎉</div>
          <h3 style="color: #065f46; margin: 0 0 6px 0;">Response Submitted!</h3>
          <p style="font-size: 13px; color: #64748b; margin: 0;">Your answer and confidence rating were sent to the teacher.</p>
        </div>
      `;
      setTimeout(() => overlay.remove(), 2000);
    } catch (err) {
      showToast('Error submitting response: ' + err.message, 'error');
      submitBtn.disabled = false;
      submitBtn.textContent = 'Submit Answer';
    }
  });
}

/**
 * Display broadcasted teacher re-explanation on student screen (Phase 4).
 */
function displayStudentBroadcast(payload) {
  const viewport = document.getElementById('slideViewport');
  if (!viewport) return;

  const existing = document.getElementById('studentBroadcastBox');
  if (existing) existing.remove();

  const explanationText = payload.explanation?.text || payload.explanation?.analogy || JSON.stringify(payload.explanation);

  const banner = document.createElement('div');
  banner.id = 'studentBroadcastBox';
  banner.className = 'student-broadcast-card';
  banner.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 6px;">
      <div style="font-weight: 700; color: #065f46; font-size: 14px; display: flex; align-items: center; gap: 6px;">
        <span>📢 Teacher Explanation</span>
        <span style="font-size: 11px; background: #bbf7d0; color: #166534; padding: 2px 6px; border-radius: 999px;">Live Clarification</span>
      </div>
      <button id="dismissBroadcastBtn" style="border: none; background: transparent; cursor: pointer; color: #64748b; font-size: 14px;">✕</button>
    </div>
    <div style="font-size: 13px; color: #1f2937; line-height: 1.5; white-space: pre-line;">
      ${escapeHtml(explanationText)}
    </div>
  `;

  viewport.prepend(banner);
  banner.querySelector('#dismissBroadcastBtn').addEventListener('click', () => banner.remove());
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function showToast(msg, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = msg;
  toast.style.position = 'fixed';
  toast.style.bottom = '20px';
  toast.style.right = '20px';
  toast.style.background = '#065f46';
  toast.style.color = '#ffffff';
  toast.style.padding = '10px 18px';
  toast.style.borderRadius = '8px';
  toast.style.zIndex = '9999';
  document.body.appendChild(toast);
  setTimeout(() => toast.remove(), 2500);
}

/**
 * =============================================================================
 * Phase 5: Group Analytics, Student Profiles, Post-Reiteration Evals & Insights
 * =============================================================================
 */

/**
 * Load and render full classroom analytics in Teacher Analytics tab.
 */
async function loadClassroomAnalytics() {
  const panel = document.getElementById('analyticsTabPanel');
  if (!panel || !activeSessionId) return;

  panel.innerHTML = '<div style="text-align:center;padding:30px;color:#64748b;"><em>Loading live analytics...</em></div>';

  const token = await getAuthToken();
  try {
    const [groupRes, rosterRes] = await Promise.all([
      fetch(`/api/v1/analytics/session/${activeSessionId}/group`, { headers: { Authorization: `Bearer ${token}` } }),
      fetch(`/api/v1/analytics/session/${activeSessionId}/students`, { headers: { Authorization: `Bearer ${token}` } }),
    ]);

    const groupData = (await groupRes.json()).data;
    const rosterData = (await rosterRes.json()).data || [];

    if (!groupData) {
      panel.innerHTML = '<div style="color:#ef4444;font-size:13px;">Failed to load analytics data.</div>';
      return;
    }

    const d = groupData.denominators;
    const c = groupData.comprehensionMetrics;

    panel.innerHTML = `
      <!-- Multi-Denominator Accounting -->
      <div class="stat-card">
        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 8px;">
          👥 Multi-Denominator Accounting
        </div>
        <div class="denominator-list">
          <div class="denominator-row">
            <span>Expected Class Size:</span>
            <span class="denominator-tag">${d.expectedClassSize}</span>
          </div>
          <div class="denominator-row">
            <span>Connected Students:</span>
            <span class="denominator-tag">${d.connectedStudents}</span>
          </div>
          <div class="denominator-row">
            <span>Feedback Respondents:</span>
            <span class="denominator-tag">${d.feedbackRespondents}</span>
          </div>
          <div class="denominator-row">
            <span>Test Respondents:</span>
            <span class="denominator-tag">${d.testRespondents}</span>
          </div>
          <div class="denominator-row">
            <span>Gaze Participants:</span>
            <span class="denominator-tag">${d.gazeParticipants}</span>
          </div>
        </div>
      </div>

      <!-- Overall Comprehension -->
      <div class="stat-card">
        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 8px;">
          🎯 Comprehension & Confidence
        </div>
        <div class="stat-grid">
          <div>
            <div class="stat-val">${c.accuracyPct}%</div>
            <div class="stat-sub">Accuracy (${c.totalResponses} answered)</div>
          </div>
          <div>
            <div class="stat-val">${c.avgConfidenceRating} / 5</div>
            <div class="stat-sub">Avg Confidence</div>
          </div>
        </div>
      </div>

      <!-- Post-Reiteration Evaluations (Before vs After) -->
      <div class="stat-card">
        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 8px;">
          🔄 Post-Reiteration Evaluations
        </div>
        <div style="display: flex; flex-direction: column; gap: 8px;">
          ${(groupData.reiterationEvaluations || []).length === 0 ? `
            <div style="font-size: 12px; color: #94a3b8;">No reiterations triggered yet.</div>
          ` : groupData.reiterationEvaluations.map(r => `
            <div class="reiteration-eval-card">
              <div style="font-weight: 600; color: #1e293b;">${escapeHtml(r.conceptTextSnippet)}...</div>
              <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                <span class="resolution-pill ${r.resolutionStatus}">
                  ${r.resolutionStatus === 'resolved' ? '✅ Resolved' : r.resolutionStatus === 'partially_resolved' ? '⚡ Partially Resolved' : r.resolutionStatus === 'needs_further_review' ? '⚠️ Needs Review' : '⏳ Follow-Up Pending'}
                </span>
                <span style="font-size: 11px; color: #64748b;">
                  ${r.preReiterationAccuracyPct !== null ? `Before: ${r.preReiterationAccuracyPct}%` : ''} 
                  ${r.postReiterationAccuracyPct !== null ? `→ After: ${r.postReiterationAccuracyPct}%` : ''}
                </span>
              </div>
              ${r.status === 'broadcast' && r.postReiterationAccuracyPct === null ? `
                <button class="ai-action-btn launch-followup-btn" data-reit-id="${r.reiterationId}" data-block-id="${r.contentBlockId}" style="margin-top: 6px; font-size: 11px;">
                  🎯 Launch Follow-up Check
                </button>
              ` : ''}
            </div>
          `).join('')}
        </div>
      </div>

      <!-- Student Roster & Individual Profiles -->
      <div class="stat-card">
        <div style="font-size: 12px; font-weight: 700; color: #065f46; margin-bottom: 8px;">
          👨‍🎓 Enrolled Student Profiles
        </div>
        <div class="student-roster-list">
          ${rosterData.length === 0 ? `
            <div style="font-size: 12px; color: #94a3b8;">No enrolled students found.</div>
          ` : rosterData.map(s => `
            <div class="student-roster-item" data-student-id="${s.id}">
              <span class="student-roster-name">${escapeHtml(s.fullName)}</span>
              <span class="student-roster-badge ${s.needsAttention ? 'alert' : 'ok'}">
                ${s.needsAttention ? `Struggle (${s.wrongCount} wrong, ${s.confusedCount} confused)` : 'On Track'}
              </span>
            </div>
          `).join('')}
        </div>
      </div>
    `;

    // Attach student modal clicks
    panel.querySelectorAll('.student-roster-item').forEach(item => {
      item.addEventListener('click', () => {
        const studentId = item.getAttribute('data-student-id');
        openStudentProfileModal(studentId);
      });
    });

    // Attach follow-up quiz launch clicks
    panel.querySelectorAll('.launch-followup-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const blockId = btn.getAttribute('data-block-id');
        launchFollowUpQuiz(blockId);
      });
    });

  } catch (err) {
    panel.innerHTML = `<div style="color:#ef4444;font-size:13px;">Error loading analytics: ${err.message}</div>`;
  }
}

/**
 * Open Individual Student Learning Profile Modal.
 */
async function openStudentProfileModal(studentId) {
  const token = await getAuthToken();
  const res = await fetch(`/api/v1/analytics/session/${activeSessionId}/student/${studentId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = await res.json();
  if (!data) {
    showToast('Could not load student profile.', 'error');
    return;
  }

  const existing = document.querySelector('.student-modal-overlay');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'student-modal-overlay';
  overlay.innerHTML = `
    <div class="student-modal">
      <div class="student-modal-header">
        <div>
          <h3 style="margin: 0; font-size: 16px; color: #065f46; font-weight: 700;">
            ${escapeHtml(data.student.fullName)} — Learning Profile
          </h3>
          <span style="font-size: 12px; color: #64748b;">${escapeHtml(data.student.email)}</span>
        </div>
        <button id="closeStudentModalBtn" class="btn btn-ghost" style="font-size: 16px; padding: 4px 8px;">✕</button>
      </div>

      <div class="student-modal-body">
        <!-- Tracking & Consent Status -->
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 8px; padding: 10px 14px; font-size: 12px; color: #166534;">
          <strong>Tracking Quality:</strong> ${data.trackingStatus.qualityDescription}
        </div>

        <!-- Metric Summary -->
        <div class="stat-grid">
          <div class="stat-card">
            <div class="stat-val">${data.metrics.accuracyPct}%</div>
            <div class="stat-sub">Quiz Accuracy (${data.metrics.totalTestsTaken} tests)</div>
          </div>
          <div class="stat-card">
            <div class="stat-val">${data.metrics.avgConfidenceRating} / 5</div>
            <div class="stat-sub">Average Confidence</div>
          </div>
        </div>

        <!-- Direct Feedback (Explicit) -->
        <div class="evidence-box">
          <div class="evidence-box-title">
            <span>💬 Direct Feedback (Explicit Student Submission)</span>
            <span>${data.evidenceStreams.directFeedback.length} items</span>
          </div>
          ${data.evidenceStreams.directFeedback.length === 0 ? `
            <div style="font-size: 12px; color: #94a3b8;">No direct confusion or questions flagged.</div>
          ` : data.evidenceStreams.directFeedback.map(f => `
            <div style="border-bottom: 1px solid #e2e8f0; padding: 6px 0; font-size: 12px;">
              <span style="font-weight: 700; color: #b91c1c;">[Slide ${f.slideNumber} • ${f.type}]:</span> 
              <span>${escapeHtml(f.message || 'Marked as confused')}</span>
            </div>
          `).join('')}
        </div>

        <!-- Comprehension Test Responses -->
        <div class="evidence-box">
          <div class="evidence-box-title">
            <span>🎯 Comprehension Tests (Verified Evidence)</span>
            <span>${data.evidenceStreams.comprehensionTests.length} tests</span>
          </div>
          ${data.evidenceStreams.comprehensionTests.length === 0 ? `
            <div style="font-size: 12px; color: #94a3b8;">No test responses submitted in this session.</div>
          ` : data.evidenceStreams.comprehensionTests.map(t => `
            <div style="border-bottom: 1px solid #e2e8f0; padding: 6px 0; font-size: 12px;">
              <div style="font-weight: 600; color: #1e293b;">${escapeHtml(t.question)}</div>
              <div style="display: flex; gap: 12px; margin-top: 3px; font-size: 11px;">
                <span style="color: ${t.isCorrect ? '#166534' : '#991b1b'}; font-weight: 700;">
                  ${t.isCorrect ? '✅ Correct' : '❌ Wrong (Selected: ' + escapeHtml(t.selectedAnswer) + ')'}
                </span>
                <span style="color: #64748b;">Confidence: ${t.confidenceRating}/5</span>
              </div>
            </div>
          `).join('')}
        </div>

        <!-- Inferred Gaze Dwell (Multimodal Signal) -->
        <div class="evidence-box">
          <div class="evidence-box-title">
            <span>👁️ Inferred Gaze Signals (Derived Bounding Boxes)</span>
            <span>${data.evidenceStreams.inferredGazeObservations.length} observations</span>
          </div>
          ${data.evidenceStreams.inferredGazeObservations.length === 0 ? `
            <div style="font-size: 12px; color: #94a3b8;">No gaze observations recorded.</div>
          ` : data.evidenceStreams.inferredGazeObservations.map(g => `
            <div style="border-bottom: 1px solid #e2e8f0; padding: 6px 0; font-size: 12px;">
              <span style="color: #475569;">Slide ${g.slideNumber} ("${escapeHtml(g.textSnippet)}..."):</span>
              <strong style="color: ${g.dwellMs > 4000 ? '#b91c1c' : '#166534'}">${(g.dwellMs / 1000).toFixed(1)}s dwell, ${g.returnCount} returns</strong>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#closeStudentModalBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}

/**
 * Launch Teacher Follow-up check to test post-reiteration comprehension.
 */
async function launchFollowUpQuiz(blockId) {
  const question = prompt('Enter a follow-up comprehension question to verify students understand after the explanation:');
  if (!question || !question.trim()) return;

  const optA = prompt('Option A (Correct Answer):');
  const optB = prompt('Option B (Distractor):');
  if (!optA || !optB) return;

  const token = await getAuthToken();
  try {
    await fetch('/api/v1/tests', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        session_id: activeSessionId,
        content_block_id: blockId,
        question: question.trim(),
        options: [optA.trim(), optB.trim()],
        correct_answer: optA.trim(),
        test_type: 'mcq',
        source: 'teacher_followup',
      }),
    });
    showToast('🎯 Follow-up comprehension check launched to students!', 'success');
    loadClassroomAnalytics();
  } catch (err) {
    showToast('Failed to launch follow-up test: ' + err.message, 'error');
  }
}

/**
 * Open Student's Personal Learning Insights Modal.
 */
async function openStudentPersonalInsightsModal() {
  const token = await getAuthToken();
  const res = await fetch('/api/v1/analytics/student/me', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const { data } = await res.json();
  if (!data) return;

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
        <button id="closeInsightsBtn" class="btn btn-ghost" style="font-size: 16px; padding: 4px 8px;">✕</button>
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
              <div style="font-weight: 600;">${escapeHtml(t.question)}</div>
              <div style="display: flex; gap: 10px; margin-top: 4px; font-size: 11px;">
                <span style="font-weight: 700; color: ${t.isCorrect ? '#166534' : '#991b1b'}">
                  ${t.isCorrect ? '✅ Understood' : '❌ Needs Review'}
                </span>
                <span style="color: #64748b;">Confidence: ${t.confidence}/5</span>
                <span style="color: #065f46;">Class: ${escapeHtml(t.className || '')}</span>
              </div>
            </div>
          `).join('')}
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  overlay.querySelector('#closeInsightsBtn').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) overlay.remove();
  });
}
