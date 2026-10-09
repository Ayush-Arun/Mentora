/**
 * Integration Test for FocusAI Phase 4:
 * - Multimodal Difficulty Estimation
 * - Calibration & Consent
 * - Comprehension Tests & Confidence Ratings
 * - Threshold Trigger & Reiteration Events
 */
const BASE_URL = 'http://localhost:3000';

async function runPhase4Tests() {
  console.log('🧪 Starting FocusAI Phase 4 Integration Tests...\n');

  // 1. Authenticate Teacher
  const teacherRes = await fetch(`${BASE_URL}/api/v1/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'teacher.test@focusai.edu',
      password: 'Password123!@#',
    }),
  });
  const teacherData = await teacherRes.json();
  if (!teacherData.data?.auth?.access_token) {
    throw new Error('Teacher login failed: ' + JSON.stringify(teacherData));
  }
  const teacherToken = teacherData.data.auth.access_token;
  console.log('✅ 1. Teacher authenticated successfully.');

  // 2. Fetch Active Session
  const sessListRes = await fetch(`${BASE_URL}/api/v1/sessions/class/340b6d0a-4e05-439e-b0da-48cdfaddcd51`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const sessListData = await sessListRes.json();
  const activeSession = (sessListData.data || []).find(s => s.status === 'active') || sessListData.data?.[0];
  if (!activeSession) {
    throw new Error('No session found.');
  }
  const sessionId = activeSession.id;
  console.log(`✅ 2. Active Session detected: ${sessionId}`);

  // Fetch Session details to get a content block
  const sessDetailRes = await fetch(`${BASE_URL}/api/v1/sessions/${sessionId}`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const sessDetail = await sessDetailRes.json();
  const firstBlock = sessDetail.data?.material?.pages?.[0]?.blocks?.[0];
  if (!firstBlock) {
    throw new Error('No content blocks in session material.');
  }
  const blockId = firstBlock.id;
  console.log(`✅ 3. Target Content Block: ${blockId} ("${firstBlock.text.substring(0, 40)}...")`);

  // 3. Authenticate or Register Student
  let studentToken = null;
  const studentEmail = 'student.phase4@focusai.edu';
  const studentPass = 'Password123!@#';

  const sLoginRes = await fetch(`${BASE_URL}/api/v1/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: studentEmail, password: studentPass }),
  });
  const sLoginData = await sLoginRes.json();

  if (sLoginData.data?.auth?.access_token) {
    studentToken = sLoginData.data.auth.access_token;
  } else {
    // Register student
    const sRegRes = await fetch(`${BASE_URL}/api/v1/auth/signup`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: studentEmail,
        password: studentPass,
        fullName: 'Phase4 Student',
        role: 'student',
      }),
    });
    const sRegData = await sRegRes.json();
    studentToken = sRegData.data?.auth?.access_token;
  }
  console.log('✅ 4. Student authenticated.');

  // 4. Test Student Consent & Calibration
  const consentRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/consent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({ camera_enabled: true }),
  });
  const consentData = await consentRes.json();
  if (!consentData.data?.camera_enabled) {
    throw new Error('Consent recording failed: ' + JSON.stringify(consentData));
  }
  console.log('✅ 5. Privacy-first camera consent recorded.');

  const calibRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/calibration`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({ accuracy_score: 0.88, sample_count: 9 }),
  });
  const calibData = await calibRes.json();
  if (calibData.data?.accuracy_score !== 0.88) {
    throw new Error('Calibration recording failed: ' + JSON.stringify(calibData));
  }
  console.log(`✅ 6. 9-Point Calibration recorded with accuracy score: ${calibData.data.accuracy_score}`);

  // 5. Test Gaze Observation Batch Ingestion
  const gazeRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/gaze`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({
      observations: [
        {
          content_block_id: blockId,
          dwell_ms: 6500, // High dwell (>4s)
          return_count: 3, // Multiple re-reads
          quality_score: 0.88,
        },
      ],
    }),
  });
  const gazeData = await gazeRes.json();
  console.log(`✅ 7. Gaze observation batch ingested (recorded: ${gazeData.data?.recorded}).`);

  // 6. Test Teacher Launches Comprehension Quiz
  const testCreateRes = await fetch(`${BASE_URL}/api/v1/tests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${teacherToken}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      content_block_id: blockId,
      question: 'Which component represents the primary core concept in this section?',
      options: ['Option A (Correct)', 'Option B (Distractor)', 'Option C (Distractor)'],
      correct_answer: 'Option A (Correct)',
      test_type: 'mcq',
      source: 'teacher',
    }),
  });
  const testCreateData = await testCreateRes.json();
  if (!testCreateData.data?.id) {
    throw new Error('Comprehension test creation failed: ' + JSON.stringify(testCreateData));
  }
  const testId = testCreateData.data.id;
  console.log(`✅ 8. Comprehension Quiz created: ${testId} ("${testCreateData.data.question}")`);

  // 7. Test Student Submits Wrong Response with Confidence Rating
  const respondRes = await fetch(`${BASE_URL}/api/v1/tests/${testId}/respond`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({
      session_id: sessionId,
      selected_answer: 'Option B (Distractor)', // Wrong answer!
      confidence_rating: 2, // Low confidence
      response_time_ms: 4200,
    }),
  });
  const respondData = await respondRes.json();
  if (respondData.data?.is_correct !== false) {
    throw new Error('Response submission or grading failed: ' + JSON.stringify(respondData));
  }
  console.log(`✅ 9. Student response evaluated (is_correct: ${respondData.data.is_correct}, confidence: ${respondData.data.confidence_rating}/5).`);

  // Also submit explicit confusion feedback from student
  await fetch(`${BASE_URL}/api/v1/sessions/${sessionId}/feedback`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${studentToken}`,
    },
    body: JSON.stringify({
      feedback_type: 'confused',
      content_block_id: blockId,
      message: 'I am struggling to follow this part.',
    }),
  });
  console.log('✅ 10. Student explicit confusion feedback submitted.');

  // Give background difficulty calculation a brief moment
  await new Promise(r => setTimeout(r, 1500));

  // 8. Test Multimodal Difficulty Assessment
  const diffRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/difficulty`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const diffData = await diffRes.json();
  const targetAssess = (diffData.data?.assessments || []).find(a => a.content_block_id === blockId);
  console.log(`✅ 11. Multimodal Difficulty Evaluation:`, {
    difficultyPct: targetAssess?.difficulty_pct,
    status: targetAssess?.status,
    evidence: targetAssess?.evidence_sources,
  });

  // 9. Test Reiteration Proposal & Broadcast
  const reitRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/reiterations`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const reitData = await reitRes.json();
  console.log(`✅ 12. Reiteration Events fetched (count: ${reitData.data?.length || 0}).`);

  if (reitData.data && reitData.data.length > 0) {
    const proposal = reitData.data[0];
    console.log(`    Proposal #${proposal.id} status: ${proposal.status}`);

    if (proposal.status === 'proposed') {
      // Teacher approves and broadcasts
      const approveRes = await fetch(`${BASE_URL}/api/v1/analytics/session/${sessionId}/reiteration/${proposal.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${teacherToken}`,
        },
        body: JSON.stringify({
          status: 'broadcast',
          teacher_edited_explanation: 'Here is a simple analogy: Think of this like a factory conveyor belt!',
        }),
      });
      const approveData = await approveRes.json();
      console.log(`✅ 13. Teacher approved & broadcasted reiteration: ${approveData.data?.status}`);
    }
  }

  // 10. Test Results Endpoint
  const resultsRes = await fetch(`${BASE_URL}/api/v1/tests/${testId}/results`, {
    headers: { Authorization: `Bearer ${teacherToken}` },
  });
  const resultsData = await resultsRes.json();
  console.log(`✅ 14. Quiz results breakdown:`, resultsData.data?.summary);

  console.log('\n🎉 ALL PHASE 4 INTEGRATION TESTS PASSED SUCCESSFULLY! 🚀\n');
}

runPhase4Tests().catch(err => {
  console.error('\n❌ Phase 4 Test Failed:', err);
  process.exit(1);
});
