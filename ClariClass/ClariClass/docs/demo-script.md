# ClariClass — Hackathon & Live Demo Script

## 1. Setup (30 seconds)
1. Start backend: `cd backend && uvicorn main:socket_app --reload`
2. Start frontend: `cd frontend && npm run dev`
3. Open two browser windows:
   - Left Window: **Instructor Cockpit** (`http://localhost:5173`)
   - Right Window: **Student View** (`http://localhost:5173`)

## 2. Teacher Flow (1 minute)
1. Instructor clicks "Sign In with OTP", enters email `prof@clariclass.edu`.
2. Enters OTP code and logs into Instructor mode.
3. Uploads sample lecture slides (`sample_lecture.pdf`) and sets struggle threshold to `25%`.
4. System parses document into numbered chunks and generates room code (e.g. `ABC123`).
5. Instructor enters dashboard showing live heatmap.

## 3. Student Interaction & Adaptive Triggering (2 minutes)
1. In Student window, enter Room Code `ABC123` and display name "Alex".
2. Open section 3 (e.g. "Distributed Consensus Proof").
3. Flag section 3 as "Difficult" (or dwell on it for > 45s).
4. Watch the Instructor dashboard heatmap live update section 3 to red/alert intensity.
5. As threshold is crossed, Gemma 4 generates a simplified breakdown in the background.
6. The Student view automatically receives and unfolds the AI simplified explanation banner in real time.
