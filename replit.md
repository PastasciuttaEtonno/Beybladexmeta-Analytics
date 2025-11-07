# Mobile-First Web Application

## Overview
A modern, responsive web application optimized for mobile browsers, designed to manage secure authentication, user profiles, and provide five distinct content sections. The application features advanced meta-game statistics tracking for competitive scenarios, allowing users to analyze performance of combinations and individual components. It also includes robust favorite management for saving and organizing preferred combinations and decks. The business vision is to provide a comprehensive platform for enthusiasts to track, analyze, and optimize their strategies, with market potential in competitive gaming communities.

## User Preferences
I prefer clear and concise explanations. I value iterative development and expect the agent to communicate proposed changes before implementation, especially for significant architectural decisions or feature modifications. Ensure all solutions are mobile-first and maintain a consistent user experience. I prefer to use TypeScript for type safety and modern JavaScript features.

## System Architecture
The application follows a mobile-first, full-stack architecture.

**Frontend:**
-   **Technology Stack:** React with TypeScript, Tailwind CSS for styling, and Wouter for client-side routing.
-   **UI/UX:** Emphasizes a responsive design with a mobile-first approach, including a bottom navigation bar for easy access to the five main sections. Dark mode is supported and respects system preferences. Touch targets are optimized for mobile.
-   **Features:** Secure authentication, profile management (edit display name, profile picture), appearance settings, preferences, and support, all integrated into a comprehensive profile page.

**Backend:**
-   **Technology Stack:** Express.js for the API, with session-based authentication.
-   **Security:** Implements bcrypt for password hashing and uses httpOnly session cookies to enhance security. Protected routes ensure only authenticated users can access specific resources.
-   **Admin Features:** Role-based access control with an `isAdmin` field. Admin users have access to a dedicated Messages section for tournament data entry and a system for submitting tournament results, which updates various statistics tables.

**Database:**
-   **Technology Stack:** PostgreSQL (via Neon) managed with Drizzle ORM.
-   **Schema Highlights:**
    -   `Users`: Stores user credentials, display names, profile pictures, and admin status.
    -   `Combo Stats`: Tracks tournament performance for 5-part combinations (`blade`, `assist_blade`, `ratchet`, `bit`, `lock_chip`), including 1st, 2nd, 3rd place counts, and total scores.
    -   `Component Stats`: Five separate tables (`blade_stats`, `assist_blade_stats`, `ratchet_stats`, `bit_stats`, `lock_chip_stats`) track individual component performance with similar metrics.
    -   `Favorite Combos`: Allows users to save individual combinations.
    -   `Favorite Decks`: Enables users to create named groups of three combinations.
    -   `Favorite Deck Combos`: Links individual combos to specific decks, enforcing a rule that all 15 parts across the three combos in a deck must be unique.
-   **Data Operations:** Tournament scoring uses an `INSERT...ON CONFLICT DO UPDATE` (UPSERT) strategy to accumulate statistics across six tables.

**Core Features & Implementations:**
-   **Authentication:** Session-based authentication with 7-day expiration, protected routes, and an admin user creation CLI tool.
-   **Navigation:** Mobile-first bottom navigation with Home, Analytics, Favorites, Messages, and Profile sections. Admin-only sections are indicated with a lock icon.
-   **Analytics:** Leaderboard UI displaying top combinations with filtering, sorting, and search capabilities. A detailed combo page shows component images and statistics.
-   **Favorites:** Users can add/delete individual favorite combos and create/delete "decks" (groups of three combos) with strict server-side validation for unique parts.
-   **Object Storage:** Utilizes Replit's Object Storage for storing component images, served via a public endpoint with caching. Image naming follows a specific convention (lowercase, hyphens).

## External Dependencies
-   **Database:** PostgreSQL (specifically Neon for serverless PostgreSQL)
-   **ORM:** Drizzle ORM
-   **Frontend Framework:** React
-   **Styling:** Tailwind CSS
-   **Routing:** Wouter
-   **Backend Framework:** Express.js
-   **Authentication:** bcrypt (for password hashing), express-session (for session management)
-   **Object Storage:** Replit Object Storage (for component images)