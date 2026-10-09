# ClariClass — Software Requirements Specification (SRS)

## 1. Purpose
ClariClass is an adaptive classroom web application that detects when a meaningful portion of a class is struggling with the same piece of lecture content — via manual flags, reading behavior, and optional facial/gaze signals — and automatically generates and delivers a simplified explanation to struggling students in real time.

## 2. Functional Requirements
- **FR1:** Teacher can upload a PDF or PPTX file, which is parsed into ordered content chunks.
- **FR2:** Teacher can create a classroom session and receive a shareable room code.
- **FR3:** Student can join a session via room code + display name, or passwordless OTP login.
- **FR4:** Student can flag any chunk as "Difficult" or "Important."
- **FR5:** System tracks per-student dwell time and re-read count per chunk automatically.
- **FR6:** (Stretch) Student can complete a gaze calibration step; system tracks gaze-based dwell on chunks.
- **FR7:** (Stretch) System detects confusion-associated facial expressions client-side and emits a confusion signal.
- **FR8:** System computes a per-chunk struggle score combining flags, dwell, and (if present) gaze/expression signals.
- **FR9:** When the proportion of struggling students for a chunk exceeds a configurable threshold, the system calls Gemma 4 to generate a simplified version of that chunk.
- **FR10:** Simplified versions are cached and pushed live to all currently-struggling students via WebSocket, without replacing the original for others.
- **FR11:** Teacher can view a per-student dashboard showing that student's flags and struggle scores per chunk.
- **FR12:** Teacher can view a class-wide dashboard showing aggregate struggle intensity per chunk (heatmap style).
- **FR13:** "Important" flags are aggregated separately into a class highlights/summary view.

## 3. Non-Functional Requirements
- **NFR1:** Live updates (flag → threshold → simplified content) must reach clients within ~3-5 seconds.
- **NFR2:** No raw video/image data leaves the student's browser — only derived scores/signals are sent to the server.
- **NFR3:** System degrades gracefully: manual flags + dwell time alone drive the full pipeline.
- **NFR4:** Gemma 4 calls are cached per chunk to avoid redundant generation.
- **NFR5:** Open-sourced with MIT License and full deployment setup.
