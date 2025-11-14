## NovaChat Monorepo

NovaChat is a production-ready real-time chat platform built with Next.js 14, Firebase, and Gemini-powered AI assistance. This monorepo contains the web client, Cloud Functions, and shared logic to deliver a cohesive developer experience.

### Repo Layout

- `apps/web` – Next.js 14 (App Router) frontend with Tailwind and shadcn/ui
- `functions` – Firebase Cloud Functions (Node 20, TypeScript) for AI, notifications, and presence
- `shared` – Shared Zod schemas, Firestore converters, and utilities

Additional project tooling lives at the repository root (`firebase.json`, security rules, GitHub Actions, etc.).

## Prerequisites

- Node.js 20+
- pnpm 9+
- Firebase CLI (`npm install -g firebase-tools`)
- GitHub account (for CI/CD)
- Firebase project with Firestore, Authentication, Storage, and Cloud Messaging enabled
- Gemini API key (optional; required for production AI responses)

## Environment Variables

1. Copy the web template and fill in Firebase project values:
   ```bash
   cp apps/web/env.local.example apps/web/.env.local
   ```

2. Copy the functions template:
   ```bash
   cp functions/env.example functions/.env
   ```

3. Replace every `__REPLACE__` placeholder. At minimum, you must provide:
   - `FIREBASE_PROJECT_ID`
   - `FIREBASE_WEB_API_KEY`
   - `FIREBASE_APP_ID`
   - `FIREBASE_MESSAGING_SENDER_ID`
   - `FIREBASE_AUTH_DOMAIN`
   - `FIREBASE_STORAGE_BUCKET`
   - `FIREBASE_VAPID_KEY`
   - `GEMINI_API_KEY` (leave blank to use built-in stubs)

Enable optional features by toggling booleans in the env templates (for example `NEXT_PUBLIC_ENABLE_GOOGLE_AUTH=true`).

## Install Dependencies

```bash
pnpm install
```

## Running Locally

1. Start the Next.js dev server:
   ```bash
  pnpm --filter @online-chat/web dev
   ```

2. In another terminal, launch Firebase emulators (Auth, Firestore, Functions, Storage, Hosting UI):
   ```bash
   pnpm firebase:emulators
   ```

3. Visit `http://localhost:3000` to access the app. Create an email/password account, complete the profile dialog, and start chatting. Emulator FCM is stubbed; the browser console will log simulated push notifications.

## Testing

- **Unit tests** (Vitest): `pnpm -r test`
- **Playwright smoke** (runs against `PLAYWRIGHT_BASE_URL` or `http://localhost:3000`):
  ```bash
  pnpm --filter @online-chat/web run test:e2e
  ```

Tests cover shared utilities, rate limiting logic, and basic UI routing. Expand coverage as business logic grows.

## Linting & Formatting

- ESLint (monorepo): `pnpm run lint`
- Prettier + ESLint run automatically on staged files via Husky pre-commit hook.

## Firebase Resources

- `firebase.json` – Hosting setup (Next.js frameworks integration), Functions target, emulator ports
- `.firebaserc` – Project & hosting target placeholders
- `firestore.rules` – Security Rules v2 enforcing membership-based access, 10-minute edit window, typed permissions
- `firestore.indexes.json` – Composite indexes for chat listing and message pagination
- `storage.rules` – Validates chat media uploads (size/content-type) and membership
- `apps/web/public/firebase-messaging-sw.js` – Service worker for background notifications with dedupe logic

## Cloud Functions

Located in `functions/src`:

- `aiSummarizeChat`, `aiDraftReply`, `aiModerateMessage` – Callable functions calling Gemini (stubs when API key absent)
- `onMessageCreated` – Firestore trigger sending FCM notifications to chat members
- `presencePing` – HTTP endpoint for presence fallback with bearer auth and rate limiting
- Shared utilities: Zod validation, structured logging, in-memory rate limiter, Gemini helpers

Use `pnpm --filter @online-chat/functions run build` before deployment to generate `lib/`.

## Shared Package

`shared/src/index.ts` defines Zod schemas, Firestore converters, and helpers (`dmChatId`, `TEN_MINUTES_MS`). Build with `pnpm --filter @online-chat/shared run build`.

## GitHub Actions (CI/CD)

Create a workflow (not included yet) that:
1. Checks out code
2. Caches pnpm modules
3. Runs `pnpm install`
4. Executes lint, unit tests, Playwright smoke (optional on PRs)
5. Builds shared, functions, and web apps
6. Deploys to Firebase Hosting, Firestore rules, Storage rules, and Functions (requires manual approval for `main`)

## Smoke Checklist (Pre-Deploy)

- [ ] Email/password sign-in completes and redirects to `/c`
- [ ] Profile completion dialog persists display name
- [ ] Policy consent recorded and dismissed
- [ ] Chat list displays sample data from emulator
- [ ] DM creation produces deterministic chat ID
- [ ] Chat view supports sending text and updates in real-time
- [ ] Typing indicator toggles with debounce
- [ ] AI summarize & draft buttons return stubbed responses (logs call in dev)
- [ ] Background push logs appear in console when emulator message arrives
- [ ] Security rules simulator confirms member-only access paths

## First Deploy Guide

1. Authenticate CLI: `pnpm firebase:login`
2. Configure `.firebaserc` with your project ID & hosting site
3. Build shared libs and functions:
   ```bash
   pnpm --filter @online-chat/shared run build
   pnpm --filter @online-chat/functions run build
   ```
4. Build the web app:
   ```bash
   pnpm --filter @online-chat/web run build
   ```
5. Deploy rules, hosting, and functions (requires configured Firebase project):
   ```bash
   firebase deploy --only hosting,firestore:rules,storage:rules,functions
   ```

## TODOs & Extensions

- Integrate real Gemini endpoints with structured prompt templates
- Replace profile avatar URL input with Firebase Storage upload & cropping
- Implement attachment uploads (image/video/doc) with resumable uploads and previews
- Add chat muting preferences and notifications settings UI
- Expand unit and integration tests (rules simulators, function emulation)
- Set up GitHub Actions workflow file under `.github/workflows/`
- Connect analytics/monitoring (App Check, Crashlytics, Sentry)

Feel free to open issues or PRs as you expand NovaChat’s capabilities.


