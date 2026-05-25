# Frontend Documentation

## Table of Contents

- [Overview](#overview)
- [Directory Structure](#directory-structure)
- [Routing](#routing)
- [State Management & Data Flow](#state-management--data-flow)
- [Pages](#pages)
- [Layout System](#layout-system)
- [Custom Hooks](#custom-hooks)
- [Contexts](#contexts)

---

## Overview

The frontend is a single-page application (SPA) built with **React 18** and bundled by **Vite**. It communicates with the Express backend exclusively via the REST API under `/api/*`. There is no separate frontend server in production — the Express server serves the built SPA from `dist/public/`.

Key frontend characteristics:

- **Routing** — `wouter` (lightweight, ~1 kB) handles client-side navigation.
- **Server state** — TanStack Query v5 (React Query) with `staleTime: Infinity` (data fetched once per session unless explicitly invalidated).
- **Auth state** — React Context (`AuthContext`) wraps the app and provides the current user object.
- **Theme** — `next-themes` with a `ThemeProvider` context manages light/dark mode.
- **Forms** — React Hook Form + Zod resolvers for all validated forms.
- **UI primitives** — shadcn/ui built on top of Radix UI, styled via TailwindCSS.
- **Charts** — Recharts for trend and bar charts in analytics pages.
- **Animations** — Framer Motion for the intro animation and UI transitions.

---

## Directory Structure

```
client/src/
├── components/
│   ├── analytics/desktop/        # Analytics page components
│   ├── combo/desktop/            # Combo detail page components
│   ├── common/                   # Shared non-UI components
│   ├── dashboard/                # Home dashboard components
│   │   └── widgets/              # Dashboard widget sub-components
│   ├── examples/                 # Prototype/reference components (not used in prod)
│   ├── favorites/desktop/        # Favorites page components
│   ├── layout/                   # App shell and layout wrappers
│   ├── leaderboard/              # Leaderboard table components
│   ├── players/desktop/          # Players and player detail components
│   ├── profile/                  # Profile page components
│   │   └── desktop/              # Desktop-specific profile sub-components
│   ├── tournaments/desktop/      # Tournament page components
│   └── ui/                       # shadcn/ui base component library
├── contexts/
│   ├── AuthContext.tsx            # Authentication state provider
│   └── ThemeProvider.tsx          # Light/dark theme provider
├── hooks/
│   ├── useAnalyticsData.ts        # Fetch meta analytics
│   ├── useComboDetails.ts         # Fetch combo details by id/slug
│   ├── useDashboardData.ts        # Fetch home dashboard data
│   ├── useServiceHealth.ts        # Poll /api/health for DB status
│   ├── use-mobile.tsx             # Mobile breakpoint detection
│   └── use-toast.ts               # Toast notification hook
├── lib/
│   └── queryClient.ts             # TanStack Query client + apiRequest helper
├── pages/
│   ├── admin/
│   │   └── ImportTournament.tsx   # Admin: import a new tournament
│   ├── About.tsx
│   ├── Analytics.tsx
│   ├── ComboDetail.tsx
│   ├── ComponentLeaderboard.tsx
│   ├── Contact.tsx
│   ├── Favorites.tsx
│   ├── Home.tsx
│   ├── Login.tsx
│   ├── PlayerDetail.tsx
│   ├── Players.tsx
│   ├── PrivacyPolicy.tsx
│   ├── Profile.tsx
│   ├── ServiceUnavailable.tsx
│   ├── Terms.tsx
│   └── TournamentDetail.tsx
├── App.tsx                        # Root component, provider tree, route definitions
└── main.tsx                       # React DOM entry point
```

---

## Routing

Routing is handled by **Wouter** (`wouter` v3). All routes are defined in `App.tsx` inside the `<AppRoutes>` component using `<Switch>` and `<Route>`.

| Path | Component | Auth Required |
|---|---|---|
| `/` | `Home` | No |
| `/login` | `Login` | No |
| `/analytics` | `Analytics` | No |
| `/leaderboard/:type` | `ComponentLeaderboard` | No |
| `/tournaments` | `Tournaments` | No |
| `/tournaments/:id` | `TournamentDetail` | No |
| `/combo/:id` | `ComboDetail` | No |
| `/players` | `Players` | No |
| `/players/:id` | `PlayerDetail` | No |
| `/favorites` | `Favorites` | Yes (implicit redirect) |
| `/profile` | `Profile` | Yes (implicit redirect) |
| `/admin/import` | `ImportTournament` | Yes + Admin role |
| `/about` | `About` | No |
| `/contact` | `Contact` | No |
| `/terms` | `Terms` | No |
| `/privacy-policy` | `PrivacyPolicy` | No |
| `*` | Redirect to `/` | — |

**Bottom navigation** (`<BottomNav>`) is rendered on all routes except `/combo/:id` (which has its own layout) and `/login`.

**Service health gate** — On app load, `useServiceHealth` polls `/api/health`. If the database is unreachable, the entire app is replaced with `<ServiceUnavailable>` before any routes render.

**Intro animation** — On the first visit to `/` in a session, `<IntroAnimation>` renders over the page and is dismissed via `sessionStorage`.

---

## State Management & Data Flow

The project deliberately avoids a global state store (no Redux, no Zustand). State is split into two layers:

### 1. Server State — TanStack Query v5

All data from the API lives in the React Query cache. Configuration in `client/src/lib/queryClient.ts`:

```ts
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,        // Never re-fetch automatically
      refetchOnWindowFocus: false,
      refetchInterval: false,
      retry: false,
    },
  },
});
```

**`apiRequest(method, url, data?)`** — a thin `fetch` wrapper that always includes `credentials: "include"` (required for session cookies) and throws on non-2xx responses.

**`getQueryFn({ on401 })`** — factory that builds a `QueryFunction` from a query key array. Handles 401 by either throwing or returning `null`, depending on the `on401` option passed.

Common patterns:

```ts
// Read-only query
const { data } = useQuery({ queryKey: ["/api/stats/combos"] });

// Mutation with cache invalidation
const mutation = useMutation({
  mutationFn: (body) => apiRequest("POST", "/api/favorites/combos", body),
  onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/favorites/combos"] }),
});
```

### 2. Client State — React Context

| Context | File | Provides |
|---|---|---|
| `AuthContext` | `contexts/AuthContext.tsx` | `user`, `loading`, `login()`, `logout()`, `updateProfile()` |
| `ThemeProvider` | `contexts/ThemeProvider.tsx` | Theme (light/dark) via `next-themes` |

**`AuthContext` flow:**

1. On mount, `AuthProvider` calls `GET /api/auth/me` to hydrate user state.
2. `login(email, password)` calls `POST /api/auth/login`, updates state on success.
3. `logout()` calls `POST /api/auth/logout`, clears state and redirects to `/login`.
4. `updateProfile(data)` calls `PATCH /api/auth/profile` and refreshes local state.

### Provider Tree (App.tsx)

```
QueryClientProvider
  └── TooltipProvider
        └── ThemeProvider
              └── AuthProvider
                    └── ResponsiveAppShell
                          └── <Routes>
                    └── Toaster
                    └── IntroAnimation (conditional)
```

---

## Pages

### `Home.tsx`
Dashboard page. Renders a bento-grid layout (`DesktopBentoGrid`) populated by `useDashboardData`. Shows top combos, trending components, and the global leaderboard preview.

### `Analytics.tsx`
Meta analytics page. Uses `useAnalyticsData` to fetch `/api/analytics/meta`. Renders `DesktopAnalyticsGrid` with combo cards and filtering controls (by season, component type).

### `ComboDetail.tsx`
Detail view for a single combo (identified by `:id` in the URL). Fetches combo stats, tournament history, and trend data. Renders chart components from `components/combo/desktop/`.

### `ComponentLeaderboard.tsx`
Leaderboard filtered by component type (`:type` = `blade` | `ratchet` | `bit` etc.). Fetches `/api/stats/leaderboard/:type`.

### `Tournaments.tsx`
Lists all available tournaments. Supports filtering by region and platform. Links to `TournamentDetail`.

### `TournamentDetail.tsx`
Shows full tournament bracket, standings, and per-player combo usage. Authenticated users can claim their combos and edit results. Fetches `/api/tournaments/:id`.

### `Players.tsx`
Paginated/searchable list of all tracked players across platforms.

### `PlayerDetail.tsx`
Per-player stats: tournament history, win rates, most-used combos, and platform-specific scores.

### `Favorites.tsx`
Authentication-gated page. Shows the user's saved combos and decks. Allows adding/removing favorites and creating/deleting decks.

### `Profile.tsx`
Authentication-gated page. Allows editing display name, linking ChallengerMode / Challonge accounts, and managing aliases.

### `admin/ImportTournament.tsx`
Admin-only page for importing new tournament results. Posts to `/api/admin/import-tournament`.

---

## Layout System

### `ResponsiveAppShell` (`components/layout/ResponsiveAppShell.tsx`)
Top-level layout wrapper. Conditionally renders the desktop sidebar (`DesktopSidebar`) or mobile bottom navigation based on the `use-mobile` hook.

### `DesktopLayout` (`components/layout/DesktopLayout.tsx`)
Two-column layout with the sidebar on the left and the main content area on the right.

### `DesktopSidebar` (`components/layout/DesktopSidebar.tsx`)
Navigation sidebar with links to all major sections, user avatar, and theme toggle.

### `AdsLayout` (`components/layout/AdsLayout.tsx`)
Wraps content with ad slot placeholders for Google AdSense integration.

### `BottomNav` (`components/BottomNav.tsx`)
Mobile-only bottom navigation bar. Rendered as a sibling of each page component in `App.tsx`.

---

## Custom Hooks

| Hook | File | Description |
|---|---|---|
| `useAnalyticsData` | `hooks/useAnalyticsData.ts` | Fetches `/api/analytics/meta`, exposes filtered/sorted combo data |
| `useComboDetails` | `hooks/useComboDetails.ts` | Fetches combo by id or slug; normalises the response shape |
| `useDashboardData` | `hooks/useDashboardData.ts` | Fetches home dashboard data (top combos, leaderboard, trends) |
| `useServiceHealth` | `hooks/useServiceHealth.ts` | Polls `/api/health`; returns `"ok"`, `"degraded"`, or `"unavailable"` |
| `use-mobile` | `hooks/use-mobile.tsx` | Returns `true` when `window.innerWidth < 768px` |
| `use-toast` | `hooks/use-toast.ts` | Exposes `toast()` function backed by Radix UI Toast |

---

## Contexts

### `AuthContext` (`contexts/AuthContext.tsx`)

```ts
interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  updateProfile: (data: Partial<User>) => Promise<void>;
}
```

Consumed via the `useAuth()` hook. `ProtectedRoute` uses this context to redirect unauthenticated users to `/login`.

### `ThemeProvider` (`contexts/ThemeProvider.tsx`)

Thin wrapper around `next-themes`'s `ThemeProvider`. Defaults to `"system"` theme. Used by the theme toggle in `DesktopSidebar`.

---

*For component-level details and the reuse guide, see [components.md](components.md).*
