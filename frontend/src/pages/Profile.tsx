import { useState, useEffect } from "react";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { useTheme } from "@/contexts/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";
import { LogOut, Moon, Sun, Lock, Info, ChevronRight, HelpCircle } from "lucide-react";

// Components
import { AliasManager } from "@/components/profile/AliasManager";
import { LinkedAccountsCard } from "@/components/profile/LinkedAccountsCard";
import { AccountLinkingAlert } from "@/components/profile/AccountLinkingAlert";
import { ParticipationsList } from "@/components/profile/ParticipationsList";
import { DesktopProfileLayout } from "@/components/profile/desktop/DesktopProfileLayout";
import { ProfileSidebar } from "@/components/profile/desktop/ProfileSidebar";
import { ProfileSettingsPanel } from "@/components/profile/desktop/ProfileSettingsPanel";

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();

  // Desktop specific state
  const [isAliasesDialogOpen, setIsAliasesDialogOpen] = useState(false);

  // A failed account link redirects here as /profile?error=... The toast is
  // immediate but dismissable, and the parameter is stripped from the URL right
  // after — so the reason is also held in state and shown beside the Connect
  // buttons, which is where someone who just failed to link is actually looking.
  const [linkError, setLinkError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      const message = decodeURIComponent(error);
      setLinkError(message);
      toast({
        title: "Account Linking Error",
        description: message,
        variant: "destructive",
      });
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [toast]);

  // Once an account is linked the warning no longer describes anything true.
  useEffect(() => {
    if (user?.challengerId || user?.challongeId) setLinkError(null);
  }, [user?.challengerId, user?.challongeId]);


  const handleLogout = async () => {
    try {
      await logout();
      toast({ title: "Logged out", description: "Come back soon!" });
    } catch (error) {
      toast({ title: "Error", description: "Failed to logout", variant: "destructive" });
    }
  };

  // --- Mobile View Component (Inline) ---
  const MobileProfileView = () => (
    <div className="md:hidden flex flex-col min-h-screen bg-background pb-20">
      <PageHeader title="Profilo" action={<HeaderLogo />} />
      <main className="flex-1 px-4 py-4 w-full mx-auto space-y-6">

        {/* User Card */}
        {user && (
          <Card className="p-6">
            <div className="flex flex-col items-center space-y-4 mb-4">
              {user.photoURL && (
                <img src={user.photoURL} alt={user.displayName || "Avatar"} className="w-20 h-20 rounded-full object-cover" />
              )}
              <div className="text-center">
                <h2 className="text-xl font-bold" data-testid="text-display-name">{user.displayName}</h2>
                {(user as any).username && <p className="text-sm text-muted-foreground">@{(user as any).username}</p>}
              </div>
            </div>

            {/* Name Edit - REMOVED per user request */}
          </Card>
        )}

        {/* Aliases */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">Storico Nickname / Alias</h2>
          <Card className="p-4">
            <AliasManager user={user as any} />
          </Card>
        </div>

        {/* Linked Accounts */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">Account Collegati</h2>
          <AccountLinkingAlert error={linkError} onDismiss={() => setLinkError(null)} />
          <Card className="overflow-hidden">
            <LinkedAccountsCard user={user as any} />
          </Card>
        </div>

        {/* Participations */}
        {user?.challengerId && (
          <div className="space-y-3">
            <h2 className="text-sm font-medium text-muted-foreground px-1">Tornei partecipati</h2>
            <Card className="p-6">
              <ParticipationsList />
            </Card>
          </div>
        )}

        {/* Theme */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">Tema applicazione</h2>
          <Card className="p-4">
            <button onClick={toggleTheme} className="w-full flex items-center justify-between">
              <div className="flex items-center gap-3">
                {theme === "dark" ? <Moon className="w-5 h-5 text-muted-foreground" /> : <Sun className="w-5 h-5 text-muted-foreground" />}
                <span className="font-medium">Dark Mode</span>
              </div>
              <div className={`w-12 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted"}`}>
                <div className={`w-5 h-5 rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : "translate-x-0.5"} mt-0.5`} />
              </div>
            </button>
          </Card>
        </div>

        {/* Legal & Support */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">Altro</h2>
          <Card className="divide-y divide-border">
            <Link href="/privacy-policy" asChild>
              <a className="w-full p-4 flex items-center gap-3">
                <Lock className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Privacy Policy</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground text-muted-foreground/50" />
              </a>
            </Link>
            <Link href="/terms" asChild>
              <a className="w-full p-4 flex items-center gap-3">
                <Info className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Termini di Servizio</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground text-muted-foreground/50" />
              </a>
            </Link>
            <Link href="/contact" asChild>
              <a className="w-full p-4 flex items-center gap-3">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Supporto</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground text-muted-foreground/50" />
              </a>
            </Link>
          </Card>
        </div>

        {/* Logout */}
        <div className="mt-4">
          {user ? (
            <Button variant="destructive" onClick={handleLogout} className="w-full h-12">
              <LogOut className="w-5 h-5 mr-2" />
              Log Out
            </Button>
          ) : (
            <Link href="/login" asChild>
              <a className="inline-flex items-center justify-center w-full h-12 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90">
                Login / Register
              </a>
            </Link>
          )}
        </div>
      </main>
    </div>
  );

  return (
    <>
      <Seo title="Profilo · Beybladexmeta Analytics" description="Gestisci il tuo profilo" robots="noindex, nofollow" />

      <MobileProfileView />

      {/* Desktop View (h-screen overflow-hidden to prevent 1px mismatch scrollbars) */}
      <div className="hidden md:block h-screen overflow-hidden bg-background">
        <DesktopProfileLayout
          sidebar={
            <ProfileSidebar
              user={user as any}
            />
          }
          settingsPanel={
            <ProfileSettingsPanel
              user={user as any}
              handleLogout={handleLogout}
              onOpenAliases={() => setIsAliasesDialogOpen(true)}
              linkError={linkError}
              onDismissLinkError={() => setLinkError(null)}
            />
          }
        />
      </div>

      {/* Aliases Modal for Desktop */}
      <Dialog open={isAliasesDialogOpen} onOpenChange={setIsAliasesDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Gestisci Nickname / Alias</DialogTitle>
          </DialogHeader>
          <AliasManager user={user as any} />
          <div className="flex justify-end mt-4">
            <Button variant="ghost" onClick={() => setIsAliasesDialogOpen(false)}>Close</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
