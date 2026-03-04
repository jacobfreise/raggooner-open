# 🏆 Umamusume Tournament Manager - GEMINI.md

## Project Overview
A specialized Vue 3 application built for managing community tournaments for the game Umamusume. It handles the entire lifecycle of a tournament—from track selection and player registration to drafting, banning, and live race scoring.

### Core Technologies
- **Frontend:** Vue 3 (Composition API + `<script setup>`), TypeScript, Tailwind CSS (v4), PrimeVue.
- **Backend/DB:** Firebase (Firestore for real-time state, Authentication, Hosting).
- **Tooling:** Vite, Firebase Emulators.

### Architecture Highlights
- **State Management:** Logic is centralized in focused composables (`src/composables/`). State is primarily driven by real-time Firestore synchronization.
- **Tournament State Machine:** Managed in `useTournamentFlow.ts`. Phases include: `track-selection`, `registration`, `draft` (players), `ban` (umas), `pick` (umas), `active` (races), and `completed`.
- **View Layer:** Two main views: `HomeView.vue` (listing/creating tournaments) and `TournamentView.vue` (active tournament management).
- **Component Strategy:** Phase-specific components (e.g., `RegistrationPhase.vue`, `UmaBanPhase.vue`) are used to handle different tournament statuses.

## 🚀 Building and Running

### Prerequisites
- Node.js (v18+)
- Firebase CLI (`npm install -g firebase-tools`)
- Java (for Firebase Emulators)

### Key Commands
- `npm install`: Install dependencies.
- `firebase emulators:start`: Start local Firestore (8080) and Auth (9099) emulators. **Required for local development.**
- `npm run dev`: Start the Vite development server.
- `npm run build`: Run type-checks (`vue-tsc`) and bundle the project for production.
- `npm run preview`: Preview the production build locally.

## 🛠️ Development Conventions

### Coding Style
- **Vue:** Use Composition API with `<script setup lang="ts">`. Avoid Options API.
- **Styling:** Use Tailwind CSS utility classes. Avoid separate CSS files where possible.
- **Types:** Core interfaces are defined in `src/types.ts`. All data models (Tournament, Team, Player, Race, Season) should follow these definitions.
- **Constants:** Centralized constants like `POINTS_SYSTEM`, `UMAS`, and `TOURNAMENT_FORMATS` are in `src/utils/constants.ts`.

### Data Flow & Persistence
- **Composables:** Logic for specific features (drafting, scoring, flow) must reside in `src/composables/`.
- **Firestore Updates:** Use the `secureUpdate` pattern (via `useAdmin`) to ensure ownership validation before writing to Firestore.
- **Partial Updates:** Use Firestore dot-notation (e.g., `'draft.currentIdx'`) for precise, non-destructive updates to nested state.

### Testing & Validation
- **Type Checking:** Run `vue-tsc -b` to verify type safety.
- **Manual Verification:** No automated test suite is currently configured. Rely on the Firebase Emulator suite for integration testing.

## 📂 Directory Structure (Key Files)
- `src/App.vue`: Root application component.
- `src/firebase.ts`: Firebase configuration and emulator connection logic.
- `src/types.ts`: TypeScript interfaces for the entire project.
- `src/composables/`: Core business logic and state management.
- `src/components/`: Reusable UI elements and phase-specific components.
- `src/utils/`: Helper functions, constants, and data definitions.
- `scripts/`: Maintenance and migration scripts (using `firebase-admin`).
