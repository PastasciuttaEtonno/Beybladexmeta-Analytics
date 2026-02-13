import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { BottomNav } from "@/components/BottomNav";
import Login from "@/pages/Login";
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

function AdsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center min-h-screen w-full">
      <div className="flex-1 w-full max-w-2xl relative">
        {children}
      </div>
    </div>
  );
}

export default function App() {
  function KofiSupportNotice() {
    const [open, setOpen] = useState(false);

    useEffect(() => {
      const paramForce = new URLSearchParams(window.location.search).get('showKofiBanner');
      if (paramForce === '1') { setOpen(true); return; }
      const dismissedAtStr = localStorage.getItem("kofi_support_dismissed_at");
      if (!dismissedAtStr) { setOpen(true); return; }
      const dismissedAt = new Date(dismissedAtStr).getTime();
      const now = Date.now();
      const oneDay = 1 * 24 * 60 * 60 * 1000;
      if (!(dismissedAt > 0) || (now - dismissedAt) > oneDay) {
        setOpen(true);
      }
    }, []);

    const close = () => {
      localStorage.setItem("kofi_support_dismissed_at", new Date().toISOString());
      setOpen(false);
    };

    const openKofi = () => {
      window.open('https://ko-fi.com/Y8Y61U5MNM', '_blank');
      close();
    };

    if (!open) return null;

    return (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md pointer-events-auto">
        <div className="rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg px-4 py-3">
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-muted-foreground">
              Ti piace BeybladeXMeta?{' '}
              <button
                onClick={openKofi}
                className="text-[#683ae6] hover:text-[#5a32c7] underline underline-offset-2 font-medium transition-colors"
              >
                Supportami ☕
              </button>
            </p>
            <button
              onClick={close}
              className="text-muted-foreground hover:text-foreground transition-colors"
              aria-label="Chiudi"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <AdsLayout>
              <AppRoutes />
            </AdsLayout>
            <Toaster />
            <KofiSupportNotice />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
