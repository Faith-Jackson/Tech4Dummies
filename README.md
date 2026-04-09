# Tech4Dummies 🎓

A full-stack Learning Management System (LMS) built for non-technical learners breaking into tech. Features AI-powered tutoring, live voice interviews, real-time collaboration, and a gamified XP system.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, Tailwind CSS v4 |
| Backend | Express + WebSockets (`server.ts`) |
| Database & Auth | Firebase (Firestore + Auth) |
| AI | Google Gemini 2.5 Flash (`@google/genai`) |
| Animations | Framer Motion (`motion/react`) |
| Charts | Recharts |
| Rich Text | TipTap |
| Icons | Lucide React |

---

## Getting Started

### 1. Prerequisites

- Node.js v18+ (ensure `npm` is on your PATH)
- A Firebase project with Firestore + Authentication enabled
- A Google Gemini API key

### 2. Clone & Install

```bash
git clone https://github.com/Faith-Jackson/Tech4Dummies.git
cd Tech4Dummies
npm install
```

### 3. Environment Setup

Copy `.env.example` to `.env` and fill in your values:

```bash
cp .env.example .env
```

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
GEMINI_API_KEY=your_gemini_api_key_here
APP_URL=http://localhost:5173
```

### 4. Run Locally

```bash
# Dev server (frontend + WebSocket backend)
npm run dev
```

The app will be at `http://localhost:5173`.

---

## Firebase Setup

### Authentication
Enable **Google Sign-In** (and optionally Email/Password) in the Firebase console under Authentication → Sign-in method.

### Firestore
Deploy the security rules:

```bash
firebase deploy --only firestore:rules
```

### First Admin
1. Sign in to the app
2. Go to Firebase Console → Firestore → `users` collection
3. Find your user document and set `role: "admin"`

---

## User Roles

| Role | Capabilities |
|---|---|
| `student` | View lessons, take quizzes, submit assignments, use AI Buddy |
| `mentor` | Review submissions, provide feedback, post articles/resources |
| `admin` | Full access: manage curriculum, cohorts, users, badges, quizzes |

---

## Key Features

### 🤖 AI Integration (Gemini 2.5 Flash)
- **Buddy Chat** — Lesson-aware AI tutor that answers questions in context (backed by a vector store with Firestore embedding cache)
- **Buddy Live** — Real-time voice AI assistant
- **AI Mock Interview** — Live spoken technical interview with voice feedback
- **Resume Builder** — Generates a personalized developer resume from platform stats
- **Assignment IDE** — AI code review and suggested fixes

### 🏆 Gamification
- XP earned for completing lessons, quizzes, assignments, and interviews
- Automatic level-up based on XP milestones
- Real streak tracking (consecutive days active — persisted to Firestore)
- Badges awarded by admin for achievements

### 📊 Dashboard
- Curriculum mastery bar chart
- Quiz performance line chart
- Skill radar chart
- Cohort leaderboard
- Bookmarked lessons
- Real-time activity feed

### 👥 Cohorts
- Admins create cohorts and assign students + mentors
- Cohort group chat and study group view
- Per-cohort progress leaderboard

### 💬 Communication
- Direct messaging between users
- WebSocket-powered real-time code sync (collaborative IDE)
- Forum threads with replies
- Admin announcements with unread badge

---

## Project Structure

```
src/
├── components/         # All UI components (Dashboard, LessonView, AdminPanel, …)
├── hooks/
│   └── useAuth.tsx     # Auth state, XP, streak, lesson progress
├── services/
│   ├── gemini.ts       # All Gemini AI calls (GEMINI_MODEL & GEMINI_LIVE_MODEL constants)
│   └── vectorStore.ts  # Cosine similarity search with Firestore embedding cache
├── lib/
│   ├── firestoreError.ts  # Centralised Firestore error handler
│   └── utils.ts           # Shared utilities (cn, etc.)
├── types.ts            # Full TypeScript domain model
├── firebase.ts         # Firebase initialisation
└── App.tsx             # Root component, routing, auth gating
server.ts               # Express + WebSocket server
firestore.rules         # Security rules for all collections
```

---

## AI Model Configuration

All Gemini model names are in one place — `src/services/gemini.ts`:

```ts
export const GEMINI_MODEL      = 'gemini-2.5-flash'; // text generation
export const GEMINI_LIVE_MODEL = 'gemini-2.5-flash'; // live voice sessions
```

Change them here to upgrade the whole platform at once.

---

## Deployment

1. Build the frontend:
   ```bash
   npm run build
   ```
2. Deploy the Express server (supports Render, Railway, Fly.io, etc.)
3. Set all environment variables in your hosting provider
4. Update `APP_URL` in `.env` to your production URL
5. Deploy Firestore rules: `firebase deploy --only firestore:rules`

---

## Contributing

PRs are welcome. Please open an issue first to discuss what you'd like to change.

---

## License

MIT
