import { Switch, Route, Redirect, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/contexts/AuthContext";
import { ThemeProvider } from "@/contexts/ThemeProvider";
import { BottomNav } from "@/components/BottomNav";
import { IntroAnimation } from "@/components/IntroAnimation";
import { lazy, Suspense, useState } from "react";
import { useServiceHealth } from "@/hooks/useServiceHealth";
import { ResponsiveAppShell } from "@/components/layout/ResponsiveAppShell";
import { ChatLauncher } from "@/components/chat/ChatLauncher";
import { ChunkErrorBoundary } from "@/components/ChunkErrorBoundary";

/**
 * Le rotte, divise in chunk separati.
 *
 * Prima ogni pagina era importata staticamente e il build produceva un solo
 * file da 1,18 MB (408 KB gzip): chi apriva la home scaricava anche Analytics
 * con tutto recharts, il pannello di amministrazione e le pagine legali.
 *
 * Home resta statica di proposito - e' la pagina d'ingresso, e farle aspettare
 * un secondo round trip di rete sposterebbe soltanto il problema. Tutto il
 * resto arriva quando serve.
 */
import Home from "@/pages/Home";

const Login = lazy(() => import("@/pages/Login"));
const ServiceUnavailable = lazy(() => import("@/pages/ServiceUnavailable"));
const Analytics = lazy(() => import("@/pages/Analytics"));
const Favorites = lazy(() => import("@/pages/Favorites"));
const Tournaments = lazy(() => import("@/pages/Tournaments"));
const TournamentDetail = lazy(() => import("@/pages/TournamentDetail"));
const Profile = lazy(() => import("@/pages/Profile"));
const ComboDetail = lazy(() => import("@/pages/ComboDetail"));
const ComponentLeaderboard = lazy(() => import("@/pages/ComponentLeaderboard"));
const Players = lazy(() => import("@/pages/Players"));
const PlayerDetail = lazy(() => import("@/pages/PlayerDetail"));
const About = lazy(() => import("@/pages/About"));
const Contact = lazy(() => import("@/pages/Contact"));
const Terms = lazy(() => import("@/pages/Terms"));
const PrivacyPolicy = lazy(() => import("@/pages/PrivacyPolicy"));
const Chat = lazy(() => import("@/pages/Chat"));
const ImportTournament = lazy(() => import("@/pages/admin/ImportTournament"));
const ChatLogs = lazy(() => import("@/pages/admin/ChatLogs"));

/**
 * Il riempitivo mentre il chunk della rotta arriva.
 *
 * Occupa l'altezza dello schermo perche' un fallback alto zero farebbe
 * collassare la pagina e poi risalire: un salto di layout misurabile su una
 * connessione lenta, che e' esattamente quando questo si vede.
 */
function CaricamentoRotta() {
  return (
    <div className="min-h-screen w-full" role="status" aria-live="polite">
      <span className="sr-only">Caricamento della pagina in corso</span>
    </div>
  );
}

function AppRoutes() {
  return (
    <ChunkErrorBoundary descrizione="Questa pagina non si è caricata. Di solito succede quando il sito viene aggiornato mentre lo stai usando.">
      <Suspense fallback={<CaricamentoRotta />}>
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

        <Route path="/admin/chat-logs">
          <ChatLogs />
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
      </Suspense>
    </ChunkErrorBoundary>
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
        <Suspense fallback={<CaricamentoRotta />}>
          <ServiceUnavailable />
        </Suspense>
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
            {showIntro && (
              <IntroAnimation onComplete={handleIntroComplete} />
            )}
          </AuthProvider>
        </ThemeProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
