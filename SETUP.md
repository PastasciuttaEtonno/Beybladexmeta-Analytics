# Beyblade Tournament Tracker - Setup Guide

A mobile-first web application for tracking Beyblade X tournament data, analyzing meta-game statistics, and managing favorite combinations.

## Table of Contents
- [Quick Start on Replit](#quick-start-on-replit)
- [Local Development Setup](#local-development-setup)
- [Database Setup](#database-setup)
- [Environment Variables](#environment-variables)
- [Running the Application](#running-the-application)
- [Admin User Setup](#admin-user-setup)
- [Uploading Component Images](#uploading-component-images)

---

## Quick Start on Replit

### 1. Fork/Clone This Project

**Option A: Fork the Repl**
1. Click the "Fork" button at the top of the Replit workspace
2. Your forked project will open automatically

**Option B: Import from GitHub**
1. Go to [replit.com](https://replit.com)
2. Click "Create Repl"
3. Select "Import from GitHub"
4. Paste the repository URL

### 2. Set Up Database

The project uses PostgreSQL. Replit will prompt you to create a database when you first run the project.

1. Click "Create Database" when prompted
2. Replit automatically sets up the `DATABASE_URL` environment variable

### 3. Set Up Object Storage

Component images are stored in Replit Object Storage.

1. Open the "Object Storage" tool in the left sidebar
2. Click "Create Bucket" (if not already created)
3. The system will automatically set environment variables:
   - `PUBLIC_OBJECT_SEARCH_PATHS`
   - `DEFAULT_OBJECT_STORAGE_BUCKET_ID`

### 4. Install Dependencies & Run

```bash
npm install
npm run dev
```

The app will start on port 5000. Click "Open in a new tab" to view.

### 5. Initialize Database Schema

```bash
npm run db:push
```

This creates all necessary tables in your PostgreSQL database.

### 6. Create Admin User

```bash
npm run create-admin
```

Follow the prompts to create your admin account.

---

## Local Development Setup

### Prerequisites

- **Node.js** 18+ and npm
- **PostgreSQL** 14+
- **Git**

### 1. Clone the Repository

```bash
git clone <repository-url>
cd <project-directory>
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Set Up PostgreSQL Database

**Create a new database:**

```bash
# Connect to PostgreSQL
psql -U postgres

# Create database
CREATE DATABASE beyblade_tracker;

# Exit psql
\q
```

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
# Database Configuration
DATABASE_URL=postgresql://username:password@localhost:5432/beyblade_tracker
PGHOST=localhost
PGPORT=5432
PGUSER=your_username
PGPASSWORD=your_password
PGDATABASE=beyblade_tracker

# Session Secret (generate a random string)
SESSION_SECRET=your-super-secret-session-key-change-this

# Object Storage (if running locally without Replit)
PUBLIC_OBJECT_SEARCH_PATHS=/path/to/local/storage/public
PRIVATE_OBJECT_DIR=/path/to/local/storage/private
```

**Generate a secure session secret:**

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Initialize Database Schema

```bash
npm run db:push
```

If you encounter any issues, use:

```bash
npm run db:push --force
```

### 6. Verify Database Tables

```bash
psql -U your_username -d beyblade_tracker

# List all tables
\dt

# You should see:
# - users
# - combo_stats
# - blade_stats, assist_blade_stats, ratchet_stats, bit_stats, lock_chip_stats
# - favorite_combos, favorite_decks, favorite_deck_combos
# - login_rate_limits
# - session (created by express-session)
```

---

## Database Setup

### Database Schema Overview

The application uses 11 main tables:

**Authentication & Users:**
- `users` - User accounts with credentials and profile data
- `login_rate_limits` - Login attempt tracking for security
- `session` - Express session storage

**Tournament Statistics:**
- `combo_stats` - Complete combo performance statistics
- `blade_stats`, `assist_blade_stats`, `ratchet_stats`, `bit_stats`, `lock_chip_stats` - Individual component stats

**User Favorites:**
- `favorite_combos` - Individual saved combinations
- `favorite_decks` - Named deck collections
- `favorite_deck_combos` - Combos within decks (3 per deck)

### Running Migrations

The project uses Drizzle ORM with a push-based schema sync:

```bash
# Push schema changes to database
npm run db:push

# Force push (if there are warnings)
npm run db:push --force
```

**⚠️ Important:** Never manually write SQL migrations. Always use `npm run db:push`.

### Database Reset (Development Only)

To completely reset your database:

```bash
# Drop all tables and recreate
npm run db:reset
```

---

## Environment Variables

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://user:pass@localhost:5432/db` |
| `SESSION_SECRET` | Secret for session encryption | Random 32+ character string |
| `PGHOST` | PostgreSQL host | `localhost` |
| `PGPORT` | PostgreSQL port | `5432` |
| `PGUSER` | PostgreSQL username | `postgres` |
| `PGPASSWORD` | PostgreSQL password | Your DB password |
| `PGDATABASE` | PostgreSQL database name | `beyblade_tracker` |

### Optional Variables (Object Storage)

| Variable | Description | Default |
|----------|-------------|---------|
| `PUBLIC_OBJECT_SEARCH_PATHS` | Comma-separated paths for public objects | None (Replit sets automatically) |
| `PRIVATE_OBJECT_DIR` | Directory for private objects | None (Replit sets automatically) |
| `DEFAULT_OBJECT_STORAGE_BUCKET_ID` | Default storage bucket ID | None (Replit sets automatically) |

### Production Variables (Replit Deployments)

| Variable | Description |
|----------|-------------|
| `REPL_SLUG` | Replit deployment slug (auto-set) |
| `NODE_ENV` | Environment (`development` or `production`) |

---

### Challengermode Integration

Add these variables to enable Challengermode GraphQL and server-side caching:

| Variable | Description | Default |
|----------|-------------|---------|
| `CHALLENGERMODE_REFRESH_KEY` | Refresh key for access token | None |
| `CHALLENGERMODE_GRAPHQL_URL` | GraphQL endpoint | `https://publicapi.challengermode.com/graphql` |
| `CHALLENGERMODE_AUTH_URL` | Access key endpoint | `https://publicapi.challengermode.com/mk1/v1/auth/access_keys` |
| `CHALLENGERMODE_CACHE_TTL_MINUTES` | Cache TTL for `external_api_cache` | `2880` (2 days) |

Notes:
- Server caches Challengermode responses in `external_api_cache` with a shared TTL.
- Clear cache during development with `npx tsx scripts/db-clear.ts`.

## Running the Application

### Development Mode (with hot reload)

```bash
npm run dev
```

The application runs on `http://localhost:5000`

### Production Mode

```bash
npm run build  # If you add a build step
npm start
```

### Available Scripts

```bash
npm run dev           # Start development server with hot reload
npm run db:push       # Push database schema changes
npm run db:push --force  # Force push schema (ignores warnings)
npm run create-admin  # Create an admin user (interactive CLI)
npm run db:status     # Show tables and row counts
npm run db:migrate:tournaments  # Import tournament definitions (if applicable)
```

---

## Admin User Setup

Admin users have access to the Tournament section for entering tournament results.

### Create Admin via CLI

```bash
npm run create-admin
```

You'll be prompted for:
- Username
- Password
- Display Name

### Create Admin via Database

```sql
-- Connect to database
psql -U your_username -d beyblade_tracker

-- Create admin user (password hash for "password123")
INSERT INTO users (id, username, password, display_name, is_admin)
VALUES (
  gen_random_uuid(),
  'admin',
  '$2b$10$YourBcryptHashHere',  -- Use bcrypt to hash your password
  'Administrator',
  true
);
```

**Generate password hash:**

```bash
node -e "console.log(require('bcrypt').hashSync('your-password', 10))"
```

---

## Uploading Component Images

Component images are stored in Replit Object Storage and cached for 30 days by browsers.

### Image Organization

```
public/
├── blades/
│   ├── aero.webp
│   ├── cobalt-dragoon.webp
│   └── ...
├── assist-blades/
│   ├── shark.webp
│   └── ...
├── ratchets/
│   ├── 3-60.webp
│   ├── 5-60.webp
│   └── ...
├── bits/
│   ├── elevate.webp
│   ├── point.webp
│   └── ...
└── chips/
    ├── cobalt.webp
    └── ...
```

### Image Naming Conventions

**Format:** lowercase with hyphens, `.webp` or `.png` extension

**Examples:**
- `CobaltDragoon` → `cobalt-dragoon.webp`
- `Aero` → `aero.webp`
- `5-60` → `5-60.webp`
- `Elevate` → `elevate.webp`

### Upload via Replit Object Storage Tool

1. Open "Object Storage" in the left sidebar
2. Navigate to your bucket → `public` folder
3. Create subfolders: `blades`, `assist-blades`, `ratchets`, `bits`, `chips`
4. Upload images to respective folders
5. Ensure files are set to "Public" visibility

### Image Requirements

- **Format:** WebP (preferred) or PNG
- **Size:** Recommended 256x256px to 512x512px
- **Background:** Transparent PNG or WebP
- **Naming:** Lowercase, hyphens for spaces, no special characters

### Testing Images

After uploading, images are accessible at:
```
https://your-repl.replit.app/public-objects/blades/cobalt-dragoon.webp
```

The app automatically tries multiple naming variations and formats:
1. `cobaltdragoon.webp`
2. `cobalt-dragoon.webp`
3. `cobaltdragoon.png`
4. `cobalt-dragoon.png`

---

## Application Features

### 1. **Home Dashboard ("Il Meta in Sintesi")**
- Top 3 performing components (Blade, Ratchet, Bit)
- Component images with statistics
- "First Places" and "Total Score" metrics

### 2. **Analytics**
- Paginated leaderboard (20 combos per page)
- Search and filter capabilities
- Sort by score, first places, etc.
- Detailed combo views with component images

### 3. **Favorites**
- Save individual combos
- Create decks (3 combos each)
- Unique parts validation (except "None" for Assist Blade/Lock Chip)
- Blade images displayed on all cards

### 4. **Tournament (Admin Only)**
- Submit tournament results (1st, 2nd, 3rd place)
- Each placement requires 3 combos
- Automatic stats calculation across 6 tables
- Deck validation (unique parts per placement)

### 5. **Profile**
- Edit display name
- Change profile picture
- Appearance settings
- Logout

---

## Security Features

- **Session-based authentication** (7-day rolling expiration)
- **PostgreSQL session storage** (production-ready, scalable)
- **Bcrypt password hashing**
- **Database-backed login rate limiting** (5 attempts per 15 minutes)
- **Secure cookie settings** (httpOnly, secure in production)
- **CSRF protection** via session tokens
- **Security headers** (CSP, XSS Protection, HSTS, X-Frame-Options)

---

## Troubleshooting

### Database Connection Issues

```bash
# Check PostgreSQL is running
pg_isready

# Check connection
psql -U your_username -d beyblade_tracker -c "SELECT 1;"
```

### Port Already in Use

```bash
# Kill process on port 5000
lsof -ti:5000 | xargs kill -9

# Or use a different port
PORT=3000 npm run dev
```

### Session Issues

If users can't log in or sessions expire immediately:

1. Check `SESSION_SECRET` is set
2. Verify PostgreSQL connection for session storage
3. Clear sessions: `DELETE FROM session;`

### Image Loading Issues

1. Verify Object Storage is set up
2. Check `PUBLIC_OBJECT_SEARCH_PATHS` environment variable
3. Ensure images are in correct folders with correct names
4. Check browser console for 404 errors

### Database Schema Mismatches

```bash
# Force sync schema
npm run db:push --force
```

---

## Development Tips

### Hot Reload

The development server (`npm run dev`) uses `tsx` with automatic reload on file changes.

### Database Inspection

```bash
# Connect to database
psql $DATABASE_URL

# Useful queries
SELECT * FROM users;
SELECT COUNT(*) FROM combo_stats;
SELECT * FROM favorite_combos WHERE user_id = 'your-user-id';
```

### Testing Authentication

```bash
# Create test user via CLI
npm run create-admin

# Or insert directly
INSERT INTO users (id, username, password, display_name, is_admin)
VALUES (gen_random_uuid(), 'testuser', '$2b$10$...', 'Test User', false);
```

---

## Production Deployment

### Replit Deployments

1. Click "Deploy" in the Replit interface
2. Configure custom domain (optional)
3. Set `NODE_ENV=production`
4. Ensure all environment variables are set
5. Database and Object Storage are automatically configured

### Environment Checks

The app automatically detects production via `REPL_SLUG` environment variable and enables:
- Secure cookies
- HTTPS-only mode
- Production cache headers

---

## Support & Documentation

- **Replit Docs:** https://docs.replit.com
- **Drizzle ORM:** https://orm.drizzle.team
- **Express.js:** https://expressjs.com
- **React:** https://react.dev

---

## License

[Add your license here]

---

## Contributing

[Add contribution guidelines here]
