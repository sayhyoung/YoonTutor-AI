# Yoon AI Tutor Web

Firebase-centered Next.js prototype for the AI review coach.

## Stack

- Next.js App Router
- Firebase App Hosting
- Firebase Auth
- Firestore
- OpenAI Responses API through a server route

## Local setup

```bash
cd web
cp .env.local.example .env.local
npm install
npm run dev
```

The app runs with mock learning data and deterministic quiz feedback when `USE_MOCK_AI=true` or `OPENAI_API_KEY` is not set.

## Firebase setup

1. Create or select a Firebase project.
2. Add a Web app and copy the `NEXT_PUBLIC_FIREBASE_*` values into `.env.local`.
3. Enable Anonymous sign-in in Firebase Authentication for the pilot.
4. Create Secret Manager secrets for `OPENAI_API_KEY` and `LEARNING_API_KEY`.
5. Copy `.firebaserc.example` to `.firebaserc` and replace `your-firebase-project-id`.
6. Deploy Firestore rules and indexes:

```bash
npm run firebase:login
npm run firebase:deploy:firestore
```

7. Create a Firebase App Hosting backend and connect this `web` folder.

## Firestore connection behavior

When `NEXT_PUBLIC_FIREBASE_*` values are present, the prototype signs in anonymously, writes completed quiz sessions to `quizSessions/{sessionId}`, and writes answer attempts to `quizSessions/{sessionId}/attempts/{attemptId}`. If Firebase is not configured or a permission error occurs, the app falls back to localStorage so the prototype remains usable.

## Data model

- `users/{uid}`: login profile and role
- `students/{studentId}`: student profile and membership mapping
- `learningItems/{itemId}`: normalized wrong-answer review item
- `quizSessions/{sessionId}`: one AI review run
- `quizSessions/{sessionId}/attempts/{attemptId}`: answer attempts and feedback
- `reports/{reportId}`: generated report snapshots

## Migration notes

The current Streamlit POC remains at the repository root. This `web` app is intended to replace the Streamlit UI after the external learning API provider is connected.
