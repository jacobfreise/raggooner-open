# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Dev server:** `npm run dev`
- **Build (type-check + bundle):** `npm run build`
- **Type-check only:** `vue-tsc -b` or `vue-tsc --noEmit`
- **Preview production build:** `npm run preview`

No test framework is configured. Use `vue-tsc --noEmit` to verify type safety after changes.

## Tech Stack

Vue 3 (Composition API + `<script setup>`) · TypeScript · Vite · Tailwind CSS v4 · Firebase (Firestore, Auth) · PrimeVue · Vue Router

## Architecture

This is a tournament management app for the game Umamusume. Two views (`HomeView`, `TournamentView`) handle listing/creating tournaments and running an active tournament respectively.

### Tournament State Machine

Tournaments progress through statuses based on their format (`Tournament.format` is a string ID):

- **`uma-ban` (Blind Pick):** `registration → draft → ban → active → completed`
- **`uma-draft` (Draft Pick):** `registration → draft → ban → pick → active → completed`

All status transitions are centralized in `useTournamentFlow.ts`. The `advancePhase()` function handles forward transitions; `reopenTournament()` handles reverting from completed to active. Both are guarded by an `isAdvancing` ref to prevent race conditions.

### Composables Pattern

Logic is split into focused composables in `src/composables/`:

| Composable | Responsibility |
|---|---|
| `useTournamentFlow` | Central state machine — ALL status transitions, metadata sync on completion |
| `usePlayerDraft` | Player draft phase logic (pick players for teams, undo, snake order) |
| `useUmaDraft` | Uma draft phase logic (pick umas into team pools, slot reel animation) |
| `useGameLogic` | Active phase — race management, scoring, ban toggling, stage transitions |
| `useRoster` | Player/uma assignment editing during active phase |
| `useAdmin` | Auth, tournament CRUD, Firestore security (secureUpdate) |
| `useHallOfFame` | Hall of Fame category calculations |

### Key Data Flow

- `useAdmin` provides `secureUpdate` — a function that writes to Firestore with ownership validation
- Composables accept `tournament: Ref<Tournament | null>` and `secureUpdate` as parameters
- Real-time sync via Firestore `onSnapshot` in `TournamentView`
- Metadata sync (player stats aggregation) runs via transactions in `metadataSync.ts`

### Phase Components

Each tournament status maps to a component in `src/components/`:

| Status | Component |
|---|---|
| `registration` | `RegistrationPhase.vue` |
| `draft` | `PlayerDraftPhase.vue` |
| `ban` | `UmaBanPhase.vue` |
| `pick` | `UmaDraftPhase.vue` |
| `active`/`completed` | `playFormats/GroupsFinalsPhase.vue` |

### Data Model

Core types are in `src/types.ts`. Key interfaces: `Tournament`, `Team`, `Player`, `Race`, `Season`, `GlobalPlayer`.

- `Tournament.format` is a string ID (`'uma-ban'` or `'uma-draft'`), looked up against `TOURNAMENT_FORMATS` in `constants.ts` for display names
- `Team.umaPool?: string[]` holds umas drafted by a team (uma-draft format)
- `Tournament.draft` tracks both player draft and uma draft order/progress (reused field)
- Draft orders are generated via `draftUtils.ts` (snake draft pattern)

### Constants

`src/utils/constants.ts` contains `POINTS_SYSTEM`, `TEAM_COLORS`, `TOURNAMENT_FORMATS`, `SUPERADMIN_UIDS`, and the full `UMAS` list.

## Conventions

- Use Composition API with `<script setup lang="ts">` — no Options API
- Tailwind utility classes for styling (no separate CSS files except for animations)
- Firestore dot-notation paths (e.g., `'draft.currentIdx'`) for partial updates
