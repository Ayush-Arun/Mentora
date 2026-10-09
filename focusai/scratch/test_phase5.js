/**
 * Integration Test for FocusAI Phase 5:
 * - Group Analytics with Multi-Denominator Accounting
 * - Individual Student Learning Profiles
 * - Privacy Authorization Guards (403 on Cross-Student Access)
 * - Post-Reiteration Follow-Up Comprehension & Evaluation
 * - Multi-Session Class Historical Comparisons
 * - Student Personal Learning Portal Insights
 */
const BASE_URL = 'http://localhost:3000';

async function runPhase5Tests() {
  console.log('🧪 Starting FocusAI Phase 5 Integration Tests...\n');

  // 1. Authenticate Teacher
  const teacherRes = await fetch(`${BASE_URL}/api/v1/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'teacher.test@focusai.edu', password: 'Password123!@#' }),
  });
  const teacherData = await teacherRes.json();
  const teacherToken = teacherData.data?.auth?.access_token;
  if (!teacherToken) throw new Error('Teacher signin failed.');
  console.log('✅ 1. Teacher authenticated.');

  // 2. Authenticate Student A
  const studentARes = await fetch(`${BASE_URL}/api/v1/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student.phase4@focusai.edu', password: 'Password123!@#' }),
  });
  const studentAData = await studentARes.json();
  const studentAToken = studentAData.data?.auth?.access_token;
  const studentAId = studentAData.data?.user?.id;
  if (!studentAToken) throw new Error('Student A signin failed.');
  console.log(`✅ 2. Student A authenticated (${studentAId}).`);

  // 3. Authenticate or Register Student B (for privacy testing)
  let studentBToken = null;
  let studentBId = null;
  const sBLogin = await fetch(`${BASE_URL}/api/v1/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'student.b@focusai.edu', password: 'Password123!@#' }),
  });
  const sBLoginData = await sBLogin.json();
  if (sBLoginData.data?.auth?.access_token) {
    studentBToken = sBLoginData.data.auth.access_token;
    studentBId = sBLoginData.data.user.id;
  } else {
    await fetch(`${BASE_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'student.b@focusai.edu',
        password: 'Password123!@#',
        fullName: 'Student B',
        role: 'student',
      }),
    });
    const sBPostLogin = await fetch(`${BASE_URL}/api/v1/auth/signin`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'student.b@focusai.edu', password: 'Password123!@#' }),
    });
    const sBPostLoginData = await sBPostLogin.json();
    studentBToken = sBPostLoginData.data?.auth?.access_token;
    studentBId = sBPostLoginData.data?.user?.id;
  }
  console.log(`✅ 3. Student B authenticated (${studentBId}).`);

  // 4. Get Active Session & Class ID
  const classId = '340b6d0a-4e05-439e-b0da-48cdfaddcd51';
  const sessRes = await fetch(`${BASE_URL}/api/v1/sessions/class/${classId}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const sessList = await sessRes.json();
  const activeSession = (sessList.data || []).find(s => s.status === 'active') || sessList.data?.[0];
  const sessionId = activeSession.id;
  console.log(`✅ 4. Active Session: ${sessionId}`);

  // 5. Test Group Analytics with Multi-Denominator Accounting
  const groupRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/group`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const groupData = await groupRes.json();
  if (!groupData.data?.denominators) {
    throw new Error('Group analytics missing denominators: ' + JSON.stringify(groupData));
  }
  console.log('✅ 5. Multi-Denominator Accounting verified:', groupData.data.denominators);
  console.log('    Comprehension Metrics:', groupData.data.comprehensionMetrics);
  console.log(`    Slide Breakdown count: ${groupData.data.slideBreakdown.length}`);

  // 6. Test Teacher View of Enrolled Student Roster
  const rosterRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/students`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const rosterData = await rosterRes.json();
  console.log(`✅ 6. Student Roster fetched: ${rosterData.data?.length || 0} enrolled students.`);

  // 7. Test Individual Student Learning Profile (Teacher accessing Student A)
  const profileRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/student/${studentAId}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const profileData = await profileRes.json();
  if (!profileData.data?.student?.id) {
    throw new Error('Student profile retrieval failed: ' + JSON.stringify(profileData));
  }
  console.log(`✅ 7. Individual Student Profile retrieved for ${profileData.data.student.fullName}:`, {
    trackingQuality: profileData.data.trackingStatus.qualityDescription,
    directFeedbackCount: profileData.data.evidenceStreams.directFeedback.length,
    testResponsesCount: profileData.data.evidenceStreams.comprehensionTests.length,
    gazeObsCount: profileData.data.evidenceStreams.inferredGazeObservations.length,
  });

  // 8. Test Privacy Guard: Student B attempts to access Student A's private profile
  const crossAccessRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/student/${studentAId}`, {
    headers: { Authorization: `Bearer ${studentBToken}` },
  });
  if (crossAccessRes.status !== 403) {
    throw new Error(`Privacy breach! Expected 403 Forbidden, got ${crossAccessRes.status}`);
  }
  console.log('✅ 8. Privacy Guard passed: Student B blocked (403 Forbidden) from viewing Student A’s profile.');

  // 9. Test Student's Personal Learning Portal Insights (/student/me)
  const myInsightsRes = await fetch(`${BASE_URL}/api/v1/analytics/student/me`, {
    headers: { Authorization: `Bearer ${studentAToken}` },
  });
  const myInsightsData = await myInsightsRes.json();
  if (myInsightsData.data?.summary?.overallAccuracyPct === undefined) {
    throw new Error('Student insights missing summary: ' + JSON.stringify(myInsightsData));
  }
  console.log('✅ 9. Student Personal Insights verified:', myInsightsData.data.summary);

  // 10. Test Multi-Session Historical Comparison (/class/:id/history)
  const historyRes = await fetch(`${BASE_URL}/api/v1/analytics/class/${classId}/history`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const historyData = await historyRes.json();
  if (!historyData.data?.history) {
    throw new Error('Class history failed: ' + JSON.stringify(historyData));
  }
  console.log(`✅ 10. Multi-session Class History verified: ${historyData.data.totalSessions} sessions recorded.`);

  // 11. Test Post-Reiteration Follow-Up Comprehension Check
  const reitListRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/reiterations`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const reitList = (await reitListRes.json()).data || [];
  const targetReit = reitList.find(r => r.status === 'broadcast' || r.status === 'approved') || reitList[0];

  if (targetReit) {
    console.log(`\nTesting Post-Reiteration Follow-up for Reiteration #${targetReit.id}...`);

    // Teacher launches follow-up check
    const followUpRes = await fetch(`${BASE_URL}/api/v1/tests`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${teacherToken}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        content_block_id: targetReit.content_block_id,
        question: 'Follow-up Check: Does the alternative analogy clarify the core distinction?',
        options: ['Yes, fully understood (Correct)', 'No, still confused'],
        correct_answer: 'Yes, fully understood (Correct)',
        test_type: 'mcq',
        source: 'teacher_followup',
      }),
    });
    const followUpData = await followUpRes.json();
    const followUpTestId = followUpData.data?.id;

    // Student A answers correctly with high confidence (5/5)
    await fetch(`${BASE_URL}/api/v1/tests/${followUpTestId}/respond`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${studentAToken}`,
      },
      body: JSON.stringify({
        session_id: sessionId,
        selected_answer: 'Yes, fully understood (Correct)',
        confidence_rating: 5,
        response_time_ms: 2100,
      }),
    });

    // Re-fetch group analytics to verify before-and-after comparison
    const updatedGroupRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/group`, {
      headers: { Authorization: `Bearer ${teacherToken}` },
    });
    const updatedGroup = (await updatedGroupRes.json()).data;
    const reitEval = updatedGroup.reiterationEvaluations.find(r => r.reiterationId === targetReit.id);

    console.log(`✅ 11. Post-Reiteration Evaluation Resolution:`, {
      preAccuracy: reitEval?.preReiterationAccuracyPct,
      postAccuracy: reitEval?.postReiterationAccuracyPct,
      resolutionStatus: reitEval?.resolutionStatus,
    });
  }

  console.log('\n🎉 ALL PHASE 5 INTEGRATION TESTS COMPLETED SUCCESSFULLY! 🚀\n');
}

runPhase5Tests().catch(err => {
  console.error('\n❌ Phase 5 Test Failed:', err);
  process.exit(1);
});
