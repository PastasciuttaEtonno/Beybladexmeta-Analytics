# Design Guidelines: Mobile-First Profile Management Web App

## Design Approach
**System**: Material Design 3 principles adapted for mobile-web experience
**Inspiration**: Linear (clean productivity), Notion (profile management), Instagram (mobile navigation patterns)
**Philosophy**: Mobile-native feel with progressive enhancement for larger screens

## Typography System
- **Primary Font**: Inter (Google Fonts) - clean, readable on small screens
- **Secondary Font**: System UI fallback for performance
- **Scale**:
  - Page Titles: text-2xl font-bold (mobile), text-3xl (desktop)
  - Section Headers: text-xl font-semibold
  - Body Text: text-base font-normal
  - Captions/Labels: text-sm font-medium
  - Bottom Nav Labels: text-xs font-medium

## Layout & Spacing System
**Core Spacing Units**: Tailwind units of 3, 4, 6, 8, 12, 16
- Mobile padding: p-4 to p-6 for main containers
- Section spacing: space-y-6 for vertical rhythm
- Card padding: p-4
- Bottom nav height: h-16 (fixed)
- Safe area consideration: pb-safe for iOS notch/gesture bar

**Container Strategy**:
- Max width: max-w-2xl (centered on tablets/desktop)
- Full width on mobile: w-full
- Content padding: px-4 (mobile), px-6 (tablet+)

## Mobile Navigation Architecture

**Bottom Tab Bar** (Sticky, always visible):
- Fixed position at viewport bottom
- 6 icons with labels (Home, Analytics, Schedule, Messages, Settings, Profile)
- Active state: filled icon + accent indicator
- Inactive state: outlined icon + muted label
- Icon size: w-6 h-6
- Touch targets: min 44x44px per Apple guidelines
- Subtle top border separator

**Top Bar** (Per-page):
- Page title (left-aligned or centered based on content)
- Action buttons when needed (right-aligned)
- Height: h-14
- No hamburger menu - all navigation in bottom bar

## Core Component Library

### Login Page
- Centered vertical layout
- App logo/icon at top (w-16 h-16)
- App name: text-2xl font-bold
- Single-column form (max-w-sm centered)
- Email input + Password input (full width)
- Primary login button (full width)
- Input height: h-12 (generous touch target)
- Form spacing: space-y-4

### Profile Section
- Profile header card:
  - Circular avatar (w-24 h-24, centered)
  - Upload button overlay on hover/tap
  - Display name below (text-xl font-semibold)
  - Email below name (text-sm muted)
- Edit sections as cards:
  - "Edit Name" card with input + save button
  - "Edit Picture" card with upload trigger
  - Dark mode toggle card
  - Logout button (full width, secondary style)
- Card spacing: space-y-4

### Content Sections (5 Pages)
- Consistent page structure:
  - Top bar with title
  - Content area with scroll
  - Bottom padding to clear navigation (pb-20)
- Placeholder content as cards with icons + text
- Empty state illustrations where appropriate

### Form Inputs
- Height: h-12 for all inputs
- Border radius: rounded-lg
- Focus states: ring-2 offset pattern
- Labels: text-sm font-medium, mb-2
- Helper text: text-xs, mt-1

### Buttons
- Primary: Full width on mobile, auto on desktop
- Height: h-12 (mobile), h-10 (desktop)
- Rounded: rounded-lg
- Text: text-base font-semibold
- Touch feedback: active:scale-95 transition

### Cards
- Border radius: rounded-xl
- Padding: p-4 to p-6
- Subtle shadow: Use Tailwind shadow-sm
- Spacing between: space-y-4

## Dark Mode Implementation
- Toggle in Profile section
- Respect system preference on first load
- Persist choice in localStorage
- Smooth transition between modes (transition-colors duration-200)
- High contrast ratios for accessibility

## Icons
**Library**: Heroicons (outline for inactive, solid for active states)
**Size**: w-6 h-6 for navigation, w-5 h-5 for inline icons

## Images
**Profile Pictures**:
- Circular cropping (rounded-full)
- Fallback: User initials on gradient background
- Upload preview before save
- Compressed for performance (max 500kb)

**No hero images needed** - This is a utility app, not a marketing page

## Responsive Behavior
**Mobile (< 768px)**: Primary experience
- Bottom navigation visible
- Single column layouts
- Full-width components

**Tablet (768px - 1024px)**:
- Bottom navigation remains
- Slight padding increase
- Max-width containers centered

**Desktop (> 1024px)**:
- Consider side navigation instead of bottom bar
- Two-column layouts for profile edit
- More generous spacing (scale up by 1.5x)

## Interaction Patterns
- Tap feedback: active states on all interactive elements
- Loading states: Spinners for async operations (profile updates, image uploads)
- Success feedback: Toast notifications for saves
- Error handling: Inline validation messages
- Pull-to-refresh consideration for content sections
- Smooth page transitions (fade or slide)

## Performance Considerations
- Lazy load section content
- Optimize images before upload
- Minimal animations (only meaningful transitions)
- Fast initial paint prioritized

## Accessibility
- Minimum touch targets: 44x44px
- High contrast text ratios
- Screen reader labels for icons
- Keyboard navigation support
- Focus visible states