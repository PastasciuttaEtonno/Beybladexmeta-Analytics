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

### POST /api/auth/login
Login with email and password
```json
Request: { "email": "user@example.com", "password": "password123" }
Response: { "user": { "id": "...", "email": "...", "displayName": "...", "photoURL": null } }
```

### POST /api/auth/logout
Logout and destroy session
```json
Response: { "success": true }
```

### GET /api/auth/me
Get current authenticated user
```json
Response: { "user": { "id": "...", "email": "...", "displayName": "...", "photoURL": null } }
```

### PATCH /api/auth/profile
Update user profile
```json
Request: { "displayName": "New Name", "photoURL": "..." }
Response: { "user": { "id": "...", "email": "...", "displayName": "New Name", "photoURL": "..." } }
```

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
