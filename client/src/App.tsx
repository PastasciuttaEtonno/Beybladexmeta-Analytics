import { Switch, Route, Redirect } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
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

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />

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

      <Route>
        <Redirect to="/" />
      </Route>
    </Switch>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ThemeProvider>
          <AuthProvider>
            <AppRoutes />
            <Toaster />
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
