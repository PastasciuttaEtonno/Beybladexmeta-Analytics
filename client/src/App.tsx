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
  useEffect(() => {
    try {
      // @ts-ignore
      if (window.ezstandalone) {
        // @ts-ignore
        ezstandalone.cmd.push(function () {
          // @ts-ignore
          ezstandalone.define(103);
          // @ts-ignore
          ezstandalone.enable();
          // @ts-ignore
          ezstandalone.showAds(103);
        });
      }
    } catch (e) {
      console.error("Ezoic ad error:", e);
    }
  }, []);

  return (
    <div className="flex flex-col items-center min-h-screen">
      <div className="flex-1 w-full max-w-2xl relative">
        {children}
      </div>
      {/* Bottom Ad Placeholder - 103 */}
      <div className="w-full flex justify-center p-4 min-h-[100px]">
        <div id="ezoic-pub-ad-placeholder-103"></div>
      </div>
    </div>
  );
}

export default function App() {
  function GlobalCmAuthNotice() {
    const { user } = useAuth();
    const [open, setOpen] = useState(false);
    useEffect(() => {
      const paramForce = new URLSearchParams(window.location.search).get('showCmBanner');
      if (paramForce === '1') { setOpen(true); return; }
      const dismissedAtStr = localStorage.getItem("challonge_auth_info_dismissed_at");
      if (!dismissedAtStr) { setOpen(true); return; }
      const dismissedAt = new Date(dismissedAtStr).getTime();
      const now = Date.now();
      const twoDays = 2 * 24 * 60 * 60 * 1000;
      if (!(dismissedAt > 0) || (now - dismissedAt) > twoDays) {
        setOpen(true);
      }
    }, []);
    const close = () => {
      localStorage.setItem("challonge_auth_info_dismissed_at", new Date().toISOString());
      setOpen(false);
    };
    if (!open) return null;
    return (
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-md pointer-events-auto">
        <div className="rounded-md border bg-background shadow-lg p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-muted-foreground">autenticazione con challonge ora disponibile! 😸</p>
            <div className="flex items-center justify-between gap-2">
              {!user?.challengerId && (
                <Button type="button" size="sm" onClick={() => { window.location.href = "/login"; }}>
                  Accedi
                </Button>
              )}
              <Button type="button" size="sm" variant="outline" onClick={close}>Chiudi</Button>
            </div>
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
            <GlobalCmAuthNotice />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
