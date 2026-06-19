# Yoon AI Tutor Web - Remaining Work Plan

This file is intended to be handed to Claude Code CLI as the next implementation brief.

## Current State

- The Firebase-centered Next.js prototype lives in `web/`.
- Existing Streamlit POC files at the repository root are still present and should not be removed.
- Firebase Web config is already present in `web/.env.local`.
- Firebase project is configured in `web/.firebaserc` as `eduai-tutor-62825`.
- Firebase CLI login is already handled. Do not include or run a login step.
- The app currently uses anonymous Firebase Auth for the pilot.
- Firestore read/write code exists in:
  - `web/src/lib/firebase/client.ts`
  - `web/src/lib/firebase/firestore.ts`
- Quiz sessions are written to `quizSessions/{sessionId}`.
- Attempts are written to `quizSessions/{sessionId}/attempts/{attemptId}`.
- The app still uses mock learning data from `web/src/lib/mock-data.ts`.
- AI quiz evaluation is still mostly deterministic/mock via `web/src/lib/quiz-engine.ts` and `web/src/app/api/quiz/route.ts`.
- Student report and teacher dashboard charts are implemented with custom CSS/SVG, not a chart library.

## Guardrails

- Do not commit or print secret values from `.env.local`.
- Do not revert unrelated existing changes, especially the modified root `study_logs.csv`.
- Do not delete the original Streamlit POC yet.
- Keep Firebase Auth/Firestore initialization lazy and build-safe.
- Keep local fallback behavior so the prototype remains usable if Firebase is unavailable.
- Prefer small, verifiable steps. After each step run `npm.cmd run typecheck`, `npm.cmd run lint`, and where relevant `npm.cmd run build`.

## Priority 1 - Deploy And Verify Firestore Rules/Indexes

Goal: Make sure the currently implemented Firestore schema is actually enforced and usable.

Tasks:

1. Deploy Firestore rules and indexes.

```powershell
cd D:\AI_sandbox\YoonAI_Tutor\web
npm.cmd run firebase:deploy:firestore
```

2. Wait until the composite index is ready if Firebase reports index creation in progress.

Required index:

```json
quizSessions:
  studentId ASC
  uid ASC
  createdAt DESC
```

3. Verify the app can create a session and read it back from Firestore.

Acceptance criteria:

- Sidebar Firebase status shows `Firestore 연결`.
- Complete a quiz session.
- Save button shows `Firestore 저장됨`.
- Refresh the page and open `내 학습 리포트`.
- The completed session appears in report data after reload.

## Priority 2 - Replace Mock Learning Data With A Provider Layer

Goal: Prepare for the real learning API without wiring directly into UI components.

Create provider structure:

```text
web/src/lib/learning/
  types.ts
  provider.ts
  mock-provider.ts
  external-api-provider.ts
```

Implementation requirements:

- Move `LearningItem`-related mock fetching out of `web/src/lib/mock-data.ts`.
- Keep mock provider as default when `LEARNING_API_BASE_URL` is empty.
- Add `ExternalLearningApiProvider` but allow it to be a thin placeholder until API details are finalized.
- UI should call a provider function like:

```ts
getWrongAnswerItems(studentId: string): Promise<LearningItem[]>
```

Acceptance criteria:

- Student coaching room still loads the same four demo items through provider abstraction.
- No UI component imports `demoLearningItems` directly after this step.
- Existing reports still work.

## Priority 3 - Add Real Auth UI

Goal: Replace implicit demo identity with explicit pilot-ready login.

Initial scope:

- Student login by member ID.
- Teacher login mode.
- Keep anonymous Firebase Auth underneath for pilot if needed, but store selected profile in Firestore/local state.
- Add a clear session state model:

```ts
type AppUser = {
  uid: string;
  role: "student" | "teacher";
  studentId?: string;
  memberId?: string;
  displayName: string;
};
```

Suggested files:

```text
web/src/lib/auth/
  use-app-user.ts
  session-store.ts
web/src/components/login-screen.tsx
```

Acceptance criteria:

- On first load, user sees login screen.
- Student can enter member ID `1111` and enter the coaching room.
- Teacher can enter dashboard mode.
- Logout clears the current local app session.
- Firestore writes include `uid`, `studentId`, and `studentName`.

## Priority 4 - Improve Firestore Data Model

Goal: Make stored data useful for reports and future teacher operations.

Collections to support:

```text
users/{uid}
students/{studentId}
quizSessions/{sessionId}
quizSessions/{sessionId}/attempts/{attemptId}
reports/{reportId}
```

Add seed/upsert behavior for pilot demo users:

- `students/student-1111`
- optional `users/{uid}` profile update after login

Quiz session fields should include:

```ts
{
  id: string;
  uid: string;
  studentId: string;
  memberId: string;
  studentName: string;
  source: "mock" | "external-api";
  totalItems: number;
  completedItems: number;
  score: number;
  results: SessionResult[];
  createdAt: string;
  completedAt?: string;
}
```

Acceptance criteria:

- Firestore documents are queryable by `uid`, `studentId`, and `createdAt`.
- Student report uses Firestore data after refresh.
- Teacher dashboard has a path to show all pilot sessions. If rules block broad reads, document that teacher custom claims are required.

## Priority 5 - Connect OpenAI Response Generation

Goal: Move from deterministic-only feedback to AI-generated tutoring while keeping deterministic grading as guardrail.

Current file:

```text
web/src/app/api/quiz/route.ts
```

Requirements:

- Keep `quiz-engine.ts` as deterministic evaluator.
- Use OpenAI only to phrase feedback, not to decide final correctness.
- `USE_MOCK_AI=true` should keep current deterministic responses.
- `USE_MOCK_AI=false` and valid `OPENAI_API_KEY` should call OpenAI.
- Add clear error fallback to deterministic feedback.

Acceptance criteria:

- Mock mode still works without API key.
- OpenAI mode returns Korean tutor feedback.
- Correctness/status remains determined by local `quiz-engine.ts`.

## Priority 6 - Streaming Chat UX

Goal: Make AI quiz conversation feel closer to a production tutor.

Scope:

- Add loading state per assistant response.
- Optionally stream OpenAI response if implementation remains simple.
- Keep no-stream fallback.

Acceptance criteria:

- User sees immediate feedback that AI is responding.
- Duplicate submissions are prevented while pending.
- Failed API calls show friendly fallback, not a broken UI.

## Priority 7 - Teacher Dashboard From Firestore

Goal: Replace demo session list with Firestore-backed teacher view.

Tasks:

- Add Firestore read function for teacher dashboard.
- Decide pilot security model:
  - temporary: allow teacher dashboard in local prototype with authenticated anonymous user and restricted test data, or
  - proper: use Firebase custom claims `role=teacher`.
- Document whichever model is used.

Acceptance criteria:

- Teacher dashboard reads recent sessions from Firestore.
- Charts update after a student completes a session.
- No hardcoded `demoSessions` in teacher dashboard after this step.

## Priority 8 - External Learning API Integration

Goal: Replace mock wrong-answer data with the real learning API.

Required unknowns to confirm before implementation:

- Base URL
- Auth method
- Endpoint for student/member lookup
- Endpoint for wrong word/sentence/assessment items
- Response schema
- Error/retry policy

Expected internal normalized shape:

```ts
type LearningItem = {
  id: string;
  studentId: string;
  sourceType: "word" | "sentence" | "assessment";
  sourceLabel: string;
  unitName: string;
  promptKo: string;
  answerEn: string;
  meaningKo?: string;
  originalQuestion?: string;
  wrongAt: string;
};
```

Acceptance criteria:

- UI consumes only normalized `LearningItem[]`.
- Mock and real API providers can be switched by env var.
- API errors show a recoverable empty/error state.

## Priority 9 - Student/Teacher Report Polish

Goal: Bring parity closer to the Streamlit POC.

Tasks:

- Add session detail expansion.
- Add per-question attempts table.
- Add latest AI coach summary.
- Add filters:
  - date range
  - source type
  - status
- Add empty/loading/error states for Firestore reads.

Acceptance criteria:

- Student can inspect session history after refresh.
- Teacher can identify weak items by student and source type.
- Charts remain readable on mobile.

## Priority 10 - Voice Features

Goal: Reintroduce optional TTS/STT after core data is stable.

Original POC had:

- TTS via browser Web Speech API.
- STT via audio recorder and Whisper.

Next.js version should:

- Add TTS toggle.
- Add STT toggle only after API cost/security path is clear.
- Keep voice features optional and off by default.

Acceptance criteria:

- TTS reads assistant messages in Korean.
- STT, if implemented, sends audio to a server route and never exposes API keys in the browser.

## Priority 11 - Firebase App Hosting Deployment

Goal: Deploy the Next.js app through Firebase App Hosting.

Current config:

```text
web/apphosting.yaml
```

Checklist:

- Confirm App Hosting backend points to `web/`.
- Add secrets:
  - `OPENAI_API_KEY`
  - `LEARNING_API_KEY`
- Set runtime env:
  - `OPENAI_MODEL`
  - `USE_MOCK_AI`
  - `LEARNING_API_BASE_URL`
- Keep `runConfig.minInstances: 1` for pilot to reduce cold starts.

Acceptance criteria:

- Deployed URL loads.
- Firebase Auth works on deployed domain.
- Firestore save/read works in deployed app.
- OpenAI route works when `USE_MOCK_AI=false`.

## Priority 12 - Test Coverage

Goal: Add basic confidence before pilot.

Suggested tests:

- Unit tests for `quiz-engine.ts`.
- Provider normalization tests.
- Firestore fallback behavior tests.
- Basic Playwright smoke test:
  - login
  - answer first quiz
  - complete session
  - open report

Acceptance criteria:

- `npm.cmd run test` exists.
- Core scoring edge cases are covered.
- Smoke test can run locally against dev server.

## Suggested Immediate Next Task For Claude Code

Start with Priority 1 and Priority 2:

1. Run `npm.cmd run firebase:deploy:firestore`.
2. Verify Firestore session save/read manually or with a small local smoke script.
3. Create the `web/src/lib/learning/` provider layer.
4. Refactor `TutorPrototype` so it does not import `demoLearningItems` directly.
5. Run:

```powershell
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build
```

Then report:

- files changed
- verification results
- whether Firestore save/read worked
- next blocker, if any
