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
import Schedule from "@/pages/Schedule";
import Messages from "@/pages/Messages";
import Profile from "@/pages/Profile";
import ComboDetail from "@/pages/ComboDetail";

function AppRoutes() {
  return (
    <Switch>
      <Route path="/login" component={Login} />
      
      <Route path="/">
        <ProtectedRoute>
          <Home />
          <BottomNav />
        </ProtectedRoute>
      </Route>
      
      <Route path="/analytics">
        <ProtectedRoute>
          <Analytics />
          <BottomNav />
        </ProtectedRoute>
      </Route>
      
      <Route path="/schedule">
        <ProtectedRoute>
          <Schedule />
          <BottomNav />
        </ProtectedRoute>
      </Route>
      
      <Route path="/messages">
        <ProtectedRoute>
          <Messages />
          <BottomNav />
        </ProtectedRoute>
      </Route>
      
      <Route path="/profile">
        <ProtectedRoute>
          <Profile />
          <BottomNav />
        </ProtectedRoute>
      </Route>

      <Route path="/combo/:id">
        <ProtectedRoute>
          <ComboDetail />
        </ProtectedRoute>
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
