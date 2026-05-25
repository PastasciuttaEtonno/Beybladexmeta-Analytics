# Frontend Component Guide

This document catalogues every component in the `client/src/components/` tree, describing its responsibility, where it is used, and any notable props or patterns. Components are grouped by feature folder.

---

## Table of Contents

- [UI Base Library (shadcn/ui)](#ui-base-library-shadcnui)
- [Layout Components](#layout-components)
- [Analytics Components](#analytics-components)
- [Combo Components](#combo-components)
- [Dashboard Components](#dashboard-components)
- [Favorites Components](#favorites-components)
- [Leaderboard Components](#leaderboard-components)
- [Player Components](#player-components)
- [Profile Components](#profile-components)
- [Tournament Components](#tournament-components)
- [Common / Shared Components](#common--shared-components)
- [Top-Level Singleton Components](#top-level-singleton-components)

---

## UI Base Library (shadcn/ui)

Location: `components/ui/`

These are **generated shadcn/ui primitives** built on Radix UI. They are the atomic building blocks used everywhere. **Do not modify these directly** — regenerate via `npx shadcn@latest add <component>` and patch via composition.

| Component file | Radix primitive | Primary consumers |
|---|---|---|
| `accordion.tsx` | `@radix-ui/react-accordion` | FAQ sections, collapsible panels |
| `alert.tsx` | (custom) | Error messages, info banners |
| `alert-dialog.tsx` | `@radix-ui/react-alert-dialog` | Destructive action confirmations |
| `avatar.tsx` | `@radix-ui/react-avatar` | Player avatars, user menu |
| `badge.tsx` | (custom) | Season tags, platform labels |
| `button.tsx` | `@radix-ui/react-slot` | All interactive buttons |
| `card.tsx` | (custom) | Content containers across all pages |
| `carousel.tsx` | `embla-carousel-react` | Image carousels |
| `chart.tsx` | Recharts | Wrapper for chart theming |
| `checkbox.tsx` | `@radix-ui/react-checkbox` | Filter options, form fields |
| `collapsible.tsx` | `@radix-ui/react-collapsible` | Expandable sections |
| `command.tsx` | `cmdk` | Command palette, combo search |
| `context-menu.tsx` | `@radix-ui/react-context-menu` | Right-click menus |
| `dialog.tsx` | `@radix-ui/react-dialog` | Modal dialogs |
| `dropdown-menu.tsx` | `@radix-ui/react-dropdown-menu` | User menu, action dropdowns |
| `form.tsx` | react-hook-form + Radix | All validated forms |
| `hover-card.tsx` | `@radix-ui/react-hover-card` | Combo tooltips on hover |
| `input.tsx` | (custom) | Text inputs |
| `input-otp.tsx` | `input-otp` | OTP / token entry |
| `label.tsx` | `@radix-ui/react-label` | Form labels |
| `menubar.tsx` | `@radix-ui/react-menubar` | Admin menubar |
| `navigation-menu.tsx` | `@radix-ui/react-navigation-menu` | Desktop top nav |
| `popover.tsx` | `@radix-ui/react-popover` | Floating panels |
| `progress.tsx` | `@radix-ui/react-progress` | Win-rate progress bars |
| `radio-group.tsx` | `@radix-ui/react-radio-group` | Filter toggles |
| `resizable.tsx` | `react-resizable-panels` | Resizable layout panels |
| `scroll-area.tsx` | `@radix-ui/react-scroll-area` | Long list containers |
| `select.tsx` | `@radix-ui/react-select` | Season / region selectors |
| `separator.tsx` | `@radix-ui/react-separator` | Visual dividers |
| `sheet.tsx` | Radix Dialog (drawer variant) | Mobile slide-in panels |
| `sidebar.tsx` | (custom) | Desktop sidebar layout |
| `skeleton.tsx` | (custom) | Loading placeholders |
| `slider.tsx` | `@radix-ui/react-slider` | Range filters |
| `switch.tsx` | `@radix-ui/react-switch` | Toggle settings |
| `table.tsx` | (custom) | Data tables |
| `tabs.tsx` | `@radix-ui/react-tabs` | Page section tabs |
| `textarea.tsx` | (custom) | Multi-line inputs |
| `toast.tsx` | `@radix-ui/react-toast` | Notification toasts |
| `toaster.tsx` | (custom) | Toast container (singleton) |
| `toggle.tsx` | `@radix-ui/react-toggle` | Pressed-state buttons |
| `toggle-group.tsx` | `@radix-ui/react-toggle-group` | Multi-select toggle bars |
| `tooltip.tsx` | `@radix-ui/react-tooltip` | Hover tooltips |

**Reuse pattern:** Import from `@/components/ui/<name>` — the `@` alias maps to `client/src/`.

---

## Layout Components

Location: `components/layout/`

### `ResponsiveAppShell`
**File:** `layout/ResponsiveAppShell.tsx`  
**Used in:** `App.tsx` (wraps all routes)  
**Responsibility:** Top-level layout shell. Uses `use-mobile` to decide whether to render `DesktopLayout` (sidebar + content) or a bare mobile container. All page content is passed as `children`.

### `DesktopLayout`
**File:** `layout/DesktopLayout.tsx`  
**Used in:** `ResponsiveAppShell`  
**Responsibility:** Two-column grid layout — fixed sidebar on the left, scrollable content area on the right.

### `DesktopSidebar`
**File:** `layout/DesktopSidebar.tsx`  
**Used in:** `DesktopLayout`  
**Responsibility:** Persistent left sidebar with:
- `HeaderLogo` branding
- Primary navigation links (icons + labels)
- User avatar / login button
- Theme toggle (light/dark)
- Active route highlighting via `wouter`'s `useLocation`

### `AdsLayout`
**File:** `layout/AdsLayout.tsx`  
**Used in:** pages that include ad units  
**Responsibility:** Wraps page content with Google AdSense slot placeholders. Conditionally renders based on `NODE_ENV`.

---

## Analytics Components

Location: `components/analytics/desktop/`

### `DesktopAnalyticsGrid`
**File:** `analytics/desktop/DesktopAnalyticsGrid.tsx`  
**Used in:** `pages/Analytics.tsx`  
**Responsibility:** Renders the full analytics grid. Accepts filtered combo data and maps it to `DesktopComboCard` instances. Handles empty-state display.

**Key props:**
```ts
{ combos: ComboStat[]; season: string; isLoading: boolean }
```

### `DesktopComboCard`
**File:** `analytics/desktop/DesktopComboCard.tsx`  
**Used in:** `DesktopAnalyticsGrid`  
**Responsibility:** Single combo card showing win rate, usage count, rank badge, and component images. Clicking navigates to `/combo/:id`. Uses `DesktopComponentImage` for each part.

### `DesktopComponentImage`
**File:** `analytics/desktop/DesktopComponentImage.tsx`  
**Used in:** `DesktopComboCard`, `DesktopComboVisuals`  
**Responsibility:** Renders a component image (blade/ratchet/bit) with fallback to a placeholder. Resolves the image URL from `PUBLIC_OBJECT_SEARCH_PATHS` + component name.

---

## Combo Components

Location: `components/combo/desktop/`

### `DesktopComboStats`
**File:** `combo/desktop/DesktopComboStats.tsx`  
**Used in:** `pages/ComboDetail.tsx`  
**Responsibility:** Displays tabular statistics for a combo: placements, points, win/loss breakdown, and season-by-season summary.

### `DesktopComboTrend`
**File:** `combo/desktop/DesktopComboTrend.tsx`  
**Used in:** `pages/ComboDetail.tsx`  
**Responsibility:** Recharts `LineChart` showing combo usage trend over time (weekly aggregates). X-axis shows week labels; Y-axis shows placement or usage count.

### `DesktopComboVisuals`
**File:** `combo/desktop/DesktopComboVisuals.tsx`  
**Used in:** `pages/ComboDetail.tsx`  
**Responsibility:** Visual breakdown of a combo's components with images, names, and links to the individual component leaderboard pages.

### `DesktopTournamentHistory`
**File:** `combo/desktop/DesktopTournamentHistory.tsx`  
**Used in:** `pages/ComboDetail.tsx`  
**Responsibility:** Table of tournaments where this combo was recorded, with placement, player, and date columns. Links to `/tournaments/:id`.

---

## Dashboard Components

Location: `components/dashboard/`

### `DesktopBentoGrid`
**File:** `dashboard/DesktopBentoGrid.tsx`  
**Used in:** `pages/Home.tsx`  
**Responsibility:** CSS grid "bento box" layout for the home dashboard. Composes multiple widget components into a visually balanced grid. Accepts dashboard data from `useDashboardData`.

### `DesktopTrendWidget`
**File:** `dashboard/widgets/DesktopTrendWidget.tsx`  
**Used in:** `DesktopBentoGrid`  
**Responsibility:** Mini trend chart (Recharts `BarChart`) showing the top trending components for the current season.

---

## Favorites Components

Location: `components/favorites/desktop/`

### `DesktopFavoritesWrapper`
**File:** `favorites/desktop/DesktopFavoritesWrapper.tsx`  
**Used in:** `pages/Favorites.tsx`  
**Responsibility:** Container for the favorites page. Renders tabs for "Combos" and "Decks", delegating to the respective card components.

### `DesktopFavoriteComboCard`
**File:** `favorites/desktop/DesktopFavoriteComboCard.tsx`  
**Used in:** `DesktopFavoritesWrapper`  
**Responsibility:** Card for a saved favorite combo. Shows component names, win rate, and a remove button. Calls `DELETE /api/favorites/combos/:id` on remove.

### `DesktopFavoriteComboCardSkeleton`
**File:** `favorites/desktop/DesktopFavoriteComboCardSkeleton.tsx`  
**Used in:** `DesktopFavoritesWrapper`  
**Responsibility:** Loading placeholder matching `DesktopFavoriteComboCard`'s layout.

### `DesktopDeckCard`
**File:** `favorites/desktop/DesktopDeckCard.tsx`  
**Used in:** `DesktopFavoritesWrapper`  
**Responsibility:** Card representing a saved deck (collection of combos). Lists the combos inside and provides a delete deck button.

### `DesktopDeckCardSkeleton`
**File:** `favorites/desktop/DesktopDeckCardSkeleton.tsx`  
**Used in:** `DesktopFavoritesWrapper`  
**Responsibility:** Loading placeholder for `DesktopDeckCard`.

---

## Leaderboard Components

Location: `components/leaderboard/`

### `DesktopLeaderboardTable`
**File:** `leaderboard/DesktopLeaderboardTable.tsx`  
**Used in:** `pages/ComponentLeaderboard.tsx`, `DesktopBentoGrid`  
**Responsibility:** Sortable data table for component or player rankings. Uses `components/ui/table.tsx`. Supports pagination via props.

**Key props:**
```ts
{ rows: LeaderboardRow[]; columns: ColumnDef[]; isLoading: boolean }
```

### `MobileLeaderboardList`
**File:** `leaderboard/MobileLeaderboardList.tsx`  
**Used in:** `pages/ComponentLeaderboard.tsx`  
**Responsibility:** Card-based vertical list for the mobile leaderboard view. Renders the same data as `DesktopLeaderboardTable` but in a touch-friendly format.

---

## Player Components

Location: `components/players/desktop/`

### `DesktopPlayerHeader`
**File:** `players/desktop/DesktopPlayerHeader.tsx`  
**Used in:** `pages/PlayerDetail.tsx`  
**Responsibility:** Player profile header — avatar, display name, platform badges (ChallengerMode / Challonge), and overall rank.

### `DesktopPlatformStats`
**File:** `players/desktop/DesktopPlatformStats.tsx`  
**Used in:** `pages/PlayerDetail.tsx`  
**Responsibility:** Side-by-side platform score cards showing win count, top-4 count, and points for each platform the player is active on.

### `DesktopPlayerTournaments`
**File:** `players/desktop/DesktopPlayerTournaments.tsx`  
**Used in:** `pages/PlayerDetail.tsx`  
**Responsibility:** Table of tournaments the player has participated in, with placement, combos used, and links.

### `DesktopSlimPlayersList`
**File:** `players/desktop/DesktopSlimPlayersList.tsx`  
**Used in:** `pages/Players.tsx`  
**Responsibility:** Compact list/table of all players with search and filter support. Each row links to `/players/:id`.

---

## Profile Components

Location: `components/profile/`

### `DesktopProfileLayout`
**File:** `profile/desktop/DesktopProfileLayout.tsx`  
**Used in:** `pages/Profile.tsx`  
**Responsibility:** Two-panel layout — `ProfileSidebar` on the left, `ProfileSettingsPanel` on the right.

### `ProfileSidebar`
**File:** `profile/desktop/ProfileSidebar.tsx`  
**Used in:** `DesktopProfileLayout`  
**Responsibility:** Shows user avatar, display name, email, and quick-access links within the profile section.

### `ProfileSettingsPanel`
**File:** `profile/desktop/ProfileSettingsPanel.tsx`  
**Used in:** `DesktopProfileLayout`  
**Responsibility:** Tabbed settings panel with sections for:
- **General** — display name, email update
- **Linked Accounts** — ChallengerMode / Challonge OAuth linking
- **Aliases** — alias management

### `AliasManager`
**File:** `profile/AliasManager.tsx`  
**Used in:** `ProfileSettingsPanel`  
**Responsibility:** CRUD interface for player aliases. Calls `/api/user/aliases` (GET / POST / DELETE). Shows platform badges (CM / Challonge / manual).

### `LinkedAccountsCard`
**File:** `profile/LinkedAccountsCard.tsx`  
**Used in:** `ProfileSettingsPanel`  
**Responsibility:** Shows current linking status for ChallengerMode and Challonge accounts, with OAuth connect buttons.

### `ParticipationsList`
**File:** `profile/ParticipationsList.tsx`  
**Used in:** `pages/Profile.tsx`  
**Responsibility:** Lists the authenticated user's past tournament participations fetched from `/api/me/tournaments`.

---

## Tournament Components

Location: `components/tournaments/desktop/`

### `DesktopTournamentHeader`
**File:** `tournaments/desktop/DesktopTournamentHeader.tsx`  
**Used in:** `pages/TournamentDetail.tsx`  
**Responsibility:** Tournament title, platform, region, date, and participant count header.

### `DesktopTournamentPodium`
**File:** `tournaments/desktop/DesktopTournamentPodium.tsx`  
**Used in:** `pages/TournamentDetail.tsx`  
**Responsibility:** Visual 1st/2nd/3rd podium display with player avatars and names for the top three finishers.

### `DesktopTournamentStandings`
**File:** `tournaments/desktop/DesktopTournamentStandings.tsx`  
**Used in:** `pages/TournamentDetail.tsx`  
**Responsibility:** Full standings table with position, player name, combos used, and platform link. Authenticated users see a "Claim" button if their combos are not yet associated.

### `DesktopTournamentAuthPrompt`
**File:** `tournaments/desktop/DesktopTournamentAuthPrompt.tsx`  
**Used in:** `pages/TournamentDetail.tsx`  
**Responsibility:** Call-to-action banner prompting unauthenticated users to log in to claim their tournament results.

---

## Common / Shared Components

### `BeybladeImage`
**File:** `common/BeybladeImage.tsx`  
**Used in:** various combo and analytics components  
**Responsibility:** Image component with lazy loading, error fallback, and consistent sizing for Beyblade part images. Resolves URLs from `VITE_PUBLIC_MINIO_URL`.

### `ComponentImage`
**File:** `ComponentImage.tsx`  
**Used in:** leaderboard rows, combo cards  
**Responsibility:** Renders a single component image (blade / ratchet / bit / lock chip) with a standardised aspect ratio and fallback icon.

### `HeaderLogo`
**File:** `HeaderLogo.tsx`  
**Used in:** `DesktopSidebar`  
**Responsibility:** App logo and name mark. Links to `/`.

### `Seo`
**File:** `Seo.tsx`  
**Used in:** every page  
**Responsibility:** Injects `<title>`, `<meta description>`, and Open Graph tags into `document.head` using `useEffect`. Takes `title`, `description`, and optional `image` props.

---

## Top-Level Singleton Components

These components are rendered once at the app level in `App.tsx`.

### `ProtectedRoute`
**File:** `ProtectedRoute.tsx`  
**Used in:** `App.tsx`  
**Responsibility:** HOC / wrapper that reads `useAuth().user`. Redirects to `/login` if the user is not authenticated.

```tsx
// Usage
<ProtectedRoute>
  <Profile />
</ProtectedRoute>
```

### `IntroAnimation`
**File:** `IntroAnimation.tsx`  
**Used in:** `App.tsx`  
**Responsibility:** Full-screen intro animation using Framer Motion. Rendered on the first visit to `/` in a session (tracked via `sessionStorage`). Calls `onComplete()` when finished to unmount itself.

**Props:**
```ts
{ onComplete: () => void }
```

### `BottomNav`
**File:** `BottomNav.tsx`  
**Used in:** `App.tsx` (alongside each page route)  
**Responsibility:** Fixed bottom navigation bar for mobile devices with icons for Home, Analytics, Tournaments, Players, and Profile. Uses `useLocation` for active state.

### `TournamentRegistrationNotice`
**File:** `TournamentRegistrationNotice.tsx`  
**Used in:** `App.tsx` (currently commented out)  
**Responsibility:** Dismissable banner notifying users of an open tournament registration period.

### `LeaderboardDialog`
**File:** `LeaderboardDialog.tsx`  
**Used in:** dashboard and analytics pages  
**Responsibility:** Modal dialog wrapping a full leaderboard view for quick access without full navigation.

### `PlayerProfileDialog`
**File:** `PlayerProfileDialog.tsx`  
**Used in:** standings tables, leaderboard rows  
**Responsibility:** Modal dialog showing a compact player profile summary when clicking a player name.

### `PageHeader`
**File:** `PageHeader.tsx`  
**Used in:** most pages  
**Responsibility:** Consistent page title + subtitle header section with optional breadcrumbs.

---

## Component Naming Conventions

| Prefix | Meaning |
|---|---|
| `Desktop*` | Rendered only on non-mobile viewports |
| `Mobile*` | Rendered only on mobile viewports |
| `*Skeleton` | Loading placeholder matching the real component's layout |
| `*Dialog` | Wraps content in a `Dialog` modal |
| `*Card` | Card container with border and padding |
| `*Table` | Data table using `components/ui/table.tsx` |
| `*Layout` | Page-level layout wrapper |
| `*Panel` | Section panel within a larger layout |

---

## Reuse Guidelines

1. **Always use `components/ui/*`** for atomic elements (buttons, inputs, cards). Never create bespoke button variants outside this folder.
2. **`BeybladeImage` / `ComponentImage`** are the canonical way to render part images — they handle URL resolution, loading states, and fallbacks.
3. **`Seo`** must be included in every page component — it is the only mechanism for setting page-level meta tags.
4. **Skeleton components** (`*Skeleton`) exist for every major card type. Always render them during `isLoading` states to prevent layout shift.
5. **Desktop/Mobile split** — if a component needs different layouts for mobile vs desktop, create two separate components (`Desktop*` + `Mobile*`) and switch between them using `use-mobile` or CSS `hidden`/`block` utilities.
6. **Dialogs** — for any action that needs a modal (confirm, quick-view, form), wrap with `components/ui/dialog.tsx` instead of building a custom overlay.
