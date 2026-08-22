import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useAuth } from "@/contexts/AuthContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BottomNav } from "@/components/BottomNav";
import { TournamentRegistrationNotice } from "@/components/TournamentRegistrationNotice";
import { IntroAnimation } from "@/components/IntroAnimation";
import { useState } from "react";
import { useServiceHealth } from "@/hooks/useServiceHealth";
import Login from "@/pages/Login";
import ServiceUnavailable from "@/pages/ServiceUnavailable";
import Home from "@/pages/Home";
import Analytics from "@/pages/Analytics";
import Favorites from "@/pages/Favorites";
import Tournaments from "@/pages/Tournaments";
import TournamentDetail from "@/pages/TournamentDetail";
import Profile from "@/pages/Profile";
import ComboDetail from "@/pages/ComboDetail";
import ComponentLeaderboard from "@/pages/ComponentLeaderboard";
import Players from "@/pages/Players";
import PlayerDetail from "@/pages/PlayerDetail";
import About from "@/pages/About";
import Contact from "@/pages/Contact";
import Terms from "@/pages/Terms";
import ImportTournament from "@/pages/admin/ImportTournament";
import PrivacyPolicy from "@/pages/PrivacyPolicy";
import { ResponsiveAppShell } from "@/components/layout/ResponsiveAppShell";
import { ChatLauncher } from "@/components/chat/ChatLauncher";
import Chat from "@/pages/Chat";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

      <Route path="/privacy-policy">
        <PrivacyPolicy />
        <BottomNav />
      </Route>

      <Route path="/terms">
        <Terms />
        <BottomNav />
      </Route>

      <Route path="/about">
        <About />
        <BottomNav />
      </Route>

      <Route path="/contact">
        <Contact />
        <BottomNav />
      </Route>

      <Route path="/">
        <Home />
        <BottomNav />
      </Route>

      <Route path="/chat">
        <Chat />
        <BottomNav />
      </Route>

      <Route path="/analytics">
        <Analytics />
        <BottomNav />
      </Route>

      <Route path="/favorites">
        <Favorites />
        <BottomNav />
      </Route>

      <Route path="/tournaments">
        <Tournaments />
        <BottomNav />
      </Route>

      <Route path="/tournaments/:id">
        <TournamentDetail />
        <BottomNav />
      </Route>

      <Route path="/profile">
        <Profile />
        <BottomNav />
      </Route>

      <Route path="/combo/:id">
        <ComboDetail />
      </Route>

      <Route path="/leaderboard/:type">
        <ComponentLeaderboard />
        <BottomNav />
      </Route>

      <Route path="/players">
        <Players />
        <BottomNav />
      </Route>

      <Route path="/players/:id">
        <PlayerDetail />
        <BottomNav />
      </Route>

      <Route path="/admin/import">
        <ImportTournament />
        <BottomNav />
      </Route>

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  const serviceStatus = useServiceHealth();
  const [location] = useLocation();
  const [showIntro, setShowIntro] = useState(() => {
    // Only show on home page AND if not shown this session
    const hasShown = sessionStorage.getItem("intro_shown");
    return location === "/" && !hasShown;
  });

  const handleIntroComplete = () => {
    setShowIntro(false);
    sessionStorage.setItem("intro_shown", "true");
  };

  // Show fallback page when database is unreachable
  if (serviceStatus === "unavailable") {
    return (
      <ThemeProvider>
        <ServiceUnavailable />
      </ThemeProvider>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <ResponsiveAppShell>
              <AppRoutes />
            </ResponsiveAppShell>
            {/* Fuori dallo shell: il lanciatore resta a schermo su ogni pagina,
                perche' la domanda nasce mentre si guarda una combo. */}
            <ChatLauncher />
            <Toaster />
            {/* <TournamentRegistrationNotice /> */}
            {showIntro && (
              <IntroAnimation onComplete={handleIntroComplete} />
            )}
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
