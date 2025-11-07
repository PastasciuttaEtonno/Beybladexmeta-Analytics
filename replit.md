# Mobile-First Web Application

## Overview
A modern, responsive web application optimized for mobile browsers with secure authentication, profile management, and 5 content sections.

## Architecture
- **Frontend**: React with TypeScript, Tailwind CSS, Wouter (routing)
- **Backend**: Express.js with session-based authentication
- **Database**: PostgreSQL (Neon) with Drizzle ORM
- **Security**: bcrypt password hashing, httpOnly session cookies

## Features Implemented
1. ✅ Secure authentication with email/password
2. ✅ Session-based auth with express-session (7-day sessions)
3. ✅ Protected routes (redirect to login if not authenticated)
4. ✅ Mobile-first bottom navigation bar with 5 sections
5. ✅ 5 content sections: Home, Analytics, Schedule, Messages, Profile
6. ✅ Profile management (edit display name, upload profile picture)
7. ✅ Comprehensive profile page with settings (appearance, preferences, support)
8. ✅ Dark mode with system preference detection
9. ✅ PostgreSQL database with secure password hashing

## Database Schema

### Users Table
```typescript
{
  id: varchar (UUID, primary key)
  email: text (unique, not null)
  password: text (bcrypt hash, not null)
  displayName: text (not null)
  photoURL: text (nullable)
}
```

### Meta-Game Statistics Tables

**Combo Stats** (Tournament Combination Performance)
```typescript
{
  blade: text (primary key component)
  assist_blade: text (primary key component)
  ratchet: text (primary key component)
  bit: text (primary key component)
  lock_chip: text (primary key component)
  primi_posti: integer (1st place count, default 0)
  secondi_posti: integer (2nd place count, default 0)
  terzi_posti: integer (3rd place count, default 0)
  punteggio_totale: double precision (total score, default 0)
}
```

**Component Stats Tables** (Individual Part Performance)
Each of these tables follows the same structure:
- `blade_stats` - Blade performance
- `assist_blade_stats` - Assist Blade performance
- `ratchet_stats` - Ratchet performance
- `bit_stats` - Bit performance
- `lock_chip_stats` - Lock Chip performance

```typescript
{
  [component_name]: text (primary key)
  primi_posti: integer (default 0)
  secondi_posti: integer (default 0)
  terzi_posti: integer (default 0)
  punteggio_totale: double precision (default 0)
}
```

## Authentication Flow

### Login
1. User submits email/password via `/api/auth/login`
2. Backend verifies password hash with bcrypt
3. Session created and cookie sent to client
4. User redirected to home page

### Session Management
- Sessions stored server-side with express-session
- HttpOnly cookies (secure in production)
- 7-day session expiration
- Session validates on protected routes

### Protected Routes
- All routes except `/login` require authentication
- `ProtectedRoute` component checks session via `/api/auth/me`
- Redirects to `/login` if not authenticated

## API Endpoints

### Authentication Endpoints

**POST /api/auth/login**
Login with email and password
```json
Request: { "email": "user@example.com", "password": "password123" }
Response: { "user": { "id": "...", "email": "...", "displayName": "...", "photoURL": null } }
```

**POST /api/auth/logout**
Logout and destroy session
```json
Response: { "success": true }
```

**GET /api/auth/me**
Get current authenticated user
```json
Response: { "user": { "id": "...", "email": "...", "displayName": "...", "photoURL": null } }
```

**PATCH /api/auth/profile**
Update user profile
```json
Request: { "displayName": "New Name", "photoURL": "..." }
Response: { "user": { "id": "...", "email": "...", "displayName": "New Name", "photoURL": "..." } }
```

### Statistics Endpoints

**GET /api/stats/combos**
Get top combinations leaderboard (requires authentication)
```json
Query params: ?limit=N (optional, default 50, max 100)
Response: { 
  "combos": [
    {
      "blade": "Phoenix Wing",
      "assistBlade": "Blaze",
      "ratchet": "9-60",
      "bit": "High Needle",
      "lockChip": "Phoenix",
      "primiPosti": 15,
      "secondiPosti": 8,
      "terziPosti": 3,
      "punteggioTotale": 2450
    },
    ...
  ]
}
```
Sorted by: punteggio_totale (descending)

## Admin: Creating Users

Since this is an admin-created user system (no public registration), use the CLI tool to create users:

```bash
npx tsx server/create-user.ts <email> <password> <displayName>
```

**Example:**
```bash
npx tsx server/create-user.ts john@example.com secretpass "John Doe"
```

This will:
- Hash the password with bcrypt
- Store the user in the database
- Display the credentials

### Test User
A test user has been created for development:
- **Email**: demo@example.com
- **Password**: password123

## Running the Application

### Development
```bash
npm run dev
```
Server runs on port 5000, accessible via the Replit webview.

### Database Commands
```bash
# Push schema changes to database
npm run db:push

# Create a new user (admin only)
npx tsx server/create-user.ts <email> <password> <name>
```

## Object Storage Setup

### Folder Structure
The object storage bucket contains the following folders for component images:
- `public/assist-blades/` - Assist Blade images
- `public/bits/` - Bit images
- `public/blades/` - Blade images
- `public/chips/` - Lock Chip images
- `public/ratchets/` - Ratchet images

### Image Upload Process
1. Open the "Object Storage" tool pane in the Replit workspace
2. Navigate to the bucket: `repl-default-bucket-*`
3. Create folders if they don't exist: `public/blades`, `public/assist-blades`, `public/ratchets`, `public/bits`, `public/chips`
4. Upload images to their respective folders
5. Image naming convention: Component names converted to lowercase with hyphens (e.g., "Phoenix Wing" → "phoenix-wing.png")

### Image Serving
Images are served via the `/public-objects/:filePath` endpoint:
- Example: `/public-objects/blades/phoenix-wing.png`
- Images are cached for 1 hour (3600 seconds)
- Automatically handles image not found scenarios with fallback UI

### Combo Detail Page
- Route: `/combo/:id` (protected, requires authentication)
- Shows full combo details with all 5 component images
- Displays tournament statistics (1st, 2nd, 3rd place counts and total score)
- Accessible by tapping any combo card in the Analytics leaderboard
- Back button returns to leaderboard

## Recent Changes (Latest Session)
- ✅ Created PostgreSQL database
- ✅ Implemented bcrypt password hashing
- ✅ Built session-based authentication system
- ✅ Created secure API endpoints (login, logout, profile update)
- ✅ Updated frontend to use real authentication
- ✅ Created admin user creation tool
- ✅ Tested complete authentication flow end-to-end
- ✅ Removed Settings from bottom navbar (reduced from 6 to 5 items)
- ✅ Merged Settings content into Profile page (appearance, preferences, support)
- ✅ Created 6 meta-game statistics tables for tournament tracking
  - combo_stats (composite primary key for 5-part combinations)
  - 5 component stats tables (blade, assist_blade, ratchet, bit, lock_chip)
- ✅ All tables track: primi_posti, secondi_posti, terzi_posti, punteggio_totale
- ✅ Built leaderboard UI in Analytics section
  - GET /api/stats/combos endpoint (protected, with input validation)
  - Mobile-optimized cards showing all 5 combo components
  - Special visual treatment for top 3 (trophy, medal, award icons)
  - Displays placement stats and total scores
  - Loading states and empty state handling
- ✅ Seeded sample tournament data for testing (10 combinations)
- ✅ Set up Replit Object Storage for component images
  - Created bucket with environment variables (PUBLIC_OBJECT_SEARCH_PATHS, PRIVATE_OBJECT_DIR)
  - Implemented object storage service (server/objectStorage.ts, server/objectAcl.ts)
  - Added public file serving route (GET /public-objects/:filePath)
- ✅ Created combo detail page
  - Displays all 5 combo components with images
  - Shows tournament statistics
  - Clickable cards in leaderboard navigate to detail page
  - Rank badges and icons for top 3 positions

## Security Features
1. **Password Security**: bcrypt hashing with 10 salt rounds
2. **Session Security**: httpOnly cookies, secure flag in production
3. **Protected Routes**: Server-side session validation
4. **No Password Exposure**: Passwords never sent to client
5. **CSRF Protection**: Session-based with secure cookies

## Mobile Optimization
- Bottom navigation for easy thumb access
- Responsive design (mobile-first)
- Touch targets minimum 44x44px
- Viewport optimized for mobile browsers
- Dark mode respects system preferences
- PWA-ready meta tags

## Future Enhancements
- [ ] Admin dashboard for user management
- [ ] Role-based access control
- [ ] Email verification
- [ ] Password reset flow
- [ ] Two-factor authentication
- [ ] Actual content for the 5 sections
