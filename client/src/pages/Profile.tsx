import { useState, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation, Link } from "wouter";
import { useTheme } from "@/contexts/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
import { Seo } from "@/components/Seo";
import { apiRequest } from "@/lib/queryClient";
import {
  Camera,
  LogOut,
  Moon,
  Sun,
  Bell,
  Lock,
  HelpCircle,
  Info,
  ChevronRight,
  Loader2,
  Trash2,
} from "lucide-react";

export default function Profile() {
  const { user, logout, updateProfile } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { toast } = useToast();
  const [, setLocation] = useLocation();
  // const fileInputRef = useRef<HTMLInputElement>(null);

  const [displayName, setDisplayName] = useState(user?.displayName || "");
  const [isEditingName, setIsEditingName] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const [tosOpen, setTosOpen] = useState(false);


  // Aliases Management
  const { data: aliases, refetch: refetchAliases } = useQuery({
    queryKey: ['/api/user/aliases'],
    queryFn: async () => {
      const res = await apiRequest("GET", "/api/user/aliases");
      return await res.json();
    },
    enabled: !!user, // Only fetch when user is authenticated
  });

  const [newAlias, setNewAlias] = useState("");

  const createAliasMutation = useMutation({
    mutationFn: async (alias: string) => {
      await apiRequest("POST", "/api/user/aliases", { alias });
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Alias requested" });
      setNewAlias("");
      refetchAliases();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to create alias", variant: "destructive" });
    }
  });

  const deleteAliasMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/user/aliases/${id}`);
    },
    onSuccess: () => {
      toast({ title: "Success", description: "Alias removed" });
      refetchAliases();
    },
    onError: (err: any) => {
      toast({ title: "Error", description: err.message || "Failed to delete alias", variant: "destructive" });
    }
  });

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const error = params.get("error");
    if (error) {
      toast({
        title: "Account Linking Error",
        description: decodeURIComponent(error),
        variant: "destructive",
      });
      // Remove error from URL without reload
      const newUrl = window.location.pathname;
      window.history.replaceState({}, "", newUrl);
    }
  }, [toast]);
  const handleSaveName = async () => {
    if (!displayName.trim()) {
      toast({
        title: "Error",
        description: "Name cannot be empty",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      await updateProfile({ displayName: displayName.trim() });
      setIsEditingName(false);
      toast({
        title: "Success",
        description: "Display name updated",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update name",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  // const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
  //   const file = e.target.files?.[0];
  //   if (!file) return;

  //   if (file.size > 500000) {
  //     toast({
  //       title: "Error",
  //       description: "Image must be less than 500KB",
  //       variant: "destructive",
  //     });
  //     return;
  //   }

  //   const reader = new FileReader();
  //   reader.onloadend = async () => {
  //     const photoURL = reader.result as string;
  //     try {
  //       await updateProfile({ photoURL });
  //       toast({
  //         title: "Success",
  //         description: "Profile picture updated",
  //       });
  //     } catch (error) {
  //       toast({
  //         title: "Error",
  //         description: "Failed to upload photo",
  //         variant: "destructive",
  //       });
  //     }
  //   };
  //   reader.readAsDataURL(file);
  // };

  const handleLogout = async () => {
    try {
      await logout();
      toast({
        title: "Logged out",
        description: "Come back soon!",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to logout",
        variant: "destructive",
      });
    }
  };




  /* 
  const handleSettingClick = (label: string) => {
    let description = "";
    switch (label) {
      case "Help Center":
        description = "Write to this email: beybladexmeta@outlook.it";
        break;
      case "About":
        description =
          "The application is still in the early stages of development. Some features may not work as expected. If you encounter any issues, please contact us.";
        break;
      default:
        description = `${label} settings would open here`;
    }
    toast({ title: label, description });
  };
  */

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
      <Seo
        title="Profilo · Beybladexmeta Analytics"
        description="Gestisci il tuo profilo e le tue preferenze"
        robots="noindex, nofollow"
      />
      <PageHeader title="Profilo" action={<HeaderLogo />} />

      <main className="flex-1 px-4 py-6 max-w-2xl mx-auto w-full space-y-6">
        {user && (
          <Card className="p-6">
            <div className="flex flex-col items-center space-y-4 mb-2">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || "Avatar"} className="w-20 h-20 rounded-full object-cover" />
              ) : null}
              <div className="text-center">
                <h2 className="text-xl font-bold" data-testid="text-display-name">
                  {user.displayName}
                </h2>
              </div>
            </div>
            {/* Old Link buttons removed */}
            {!user?.challengerId && (
              isEditingName ? (
                <div className="space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="displayName">Nome</Label>
                    <Input
                      id="displayName"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      placeholder="Enter your name"
                      className="h-12"
                      data-testid="input-display-name"
                      disabled={isSaving}
                    />
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveName}
                      disabled={isSaving}
                      className="flex-1"
                      data-testid="button-save-name"
                    >
                      {isSaving ? "Saving..." : "Save"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => {
                        setIsEditingName(false);
                        setDisplayName(user.displayName || "");
                      }}
                      disabled={isSaving}
                      data-testid="button-cancel-edit"
                    >
                      Cancel
                    </Button>
                  </div>
                </div>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => setIsEditingName(true)}
                  className="w-full"
                  data-testid="button-edit-name"
                >
                  Modifica nome
                </Button>
              )
            )}
          </Card>
        )}



        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Storico Nickname / Alias
          </h2>
          <Card className="p-4 space-y-4">
            {!user?.challongeId ? (
              <div className="p-3 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md text-sm border border-orange-500/20">
                <p className="font-medium mb-2">Autenticazione Challonge richiesta</p>
                <p className="text-xs mb-3">Per richiedere alias devi prima collegare il tuo account Challonge.</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-orange-600 text-white hover:bg-orange-700 border-0"
                  onClick={() => { window.location.href = "/api/challonge/login"; }}
                >
                  Collega account Challonge
                </Button>
              </div>
            ) : (
              <>
                <div className="space-y-2">
                  <Label>Aggiungi Nickname</Label>
                  <div className="flex gap-2">
                    <Input
                      value={newAlias}
                      onChange={(e) => setNewAlias(e.target.value)}
                      placeholder="Vecchio nickname usato nei tornei..."
                    />
                    <Button
                      onClick={() => createAliasMutation.mutate(newAlias)}
                      disabled={!newAlias.trim() || createAliasMutation.isPending}
                    >
                      {createAliasMutation.isPending ? <Loader2 className="animate-spin w-4 h-4" /> : "Richiedi"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Dichiara i nickname che hai usato in passato su Challonge per abbinare i risultati ai tornei.
                  </p>
                </div>

                <div className="space-y-2">
                  {aliases?.map((alias: any) => (
                    <div key={alias.id} className="flex items-center justify-between p-2 border rounded-md">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{alias.alias}</span>
                        {alias.isVerified ? (
                          <span className="text-[10px] bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400 px-1.5 py-0.5 rounded border border-green-200 dark:border-green-800">Verificato</span>
                        ) : (
                          <span className="text-[10px] bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400 px-1.5 py-0.5 rounded border border-yellow-200 dark:border-yellow-800">In Attesa</span>
                        )}
                      </div>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => deleteAliasMutation.mutate(alias.id)} disabled={deleteAliasMutation.isPending}>
                        <Trash2 className="w-4 h-4 text-muted-foreground hover:text-destructive" />
                      </Button>
                    </div>
                  ))}
                  {!aliases?.length && (
                    <p className="text-sm text-muted-foreground text-center py-2">Nessun alias registrato.</p>
                  )}
                </div>
              </>
            )}
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Account Collegati
          </h2>
          <Card className="p-4 space-y-6">
            {/* Challengermode Section */}
            <div className="space-y-2">

              {user?.challengerId ? (
                <div className="p-3 bg-green-500/10 text-green-700 dark:text-green-400 rounded-md text-sm border border-green-500/20">
                  Challengermode: <strong>{(user as any).challengermodeUsername || user.challengerId}</strong>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full bg-[#171A21] text-white hover:bg-[#171A21]/90 border-0"
                  onClick={() => { window.location.href = "/api/challenger/login"; }}
                >
                  Collega account Challengermode
                </Button>
              )}
            </div>

            {/* Challonge Section */}
            <div className="space-y-2 pt-4 border-t">

              {(user as any)?.challongeUsername || user?.challongeId ? (
                <div className="p-3 bg-orange-500/10 text-orange-700 dark:text-orange-400 rounded-md text-sm border border-orange-500/20">
                  Challonge: <strong>{(user as any).challongeUsername || "Challonge User"}</strong>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full border-orange-500 text-orange-500 hover:bg-orange-500/10"
                  onClick={() => { window.location.href = "/api/challonge/login"; }}
                >
                  Collega account Challonge
                </Button>
              )}
            </div>
          </Card>
        </div>

        {user?.challengerId && (
          <Card className="p-6">
            <div className="mb-3">
              <h3 className="text-base font-semibold">Tornei partecipati</h3>
            </div>
            <ParticipationsList />
          </Card>
        )}

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Tema applicazione
          </h2>
          <Card className="p-4">
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between hover-elevate active-elevate-2"
              data-testid="button-toggle-theme"
            >
              <div className="flex items-center gap-3">
                {theme === "dark" ? (
                  <Moon className="w-5 h-5 text-muted-foreground" />
                ) : (
                  <Sun className="w-5 h-5 text-muted-foreground" />
                )}
                <span className="font-medium">Dark Mode</span>
              </div>
              <div
                className={`w-12 h-6 rounded-full transition-colors ${theme === "dark" ? "bg-primary" : "bg-muted"
                  }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${theme === "dark" ? "translate-x-6" : "translate-x-0.5"
                    } mt-0.5`}
                />
              </div>
            </button>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Contratti
          </h2>
          <Card className="divide-y divide-border">
            {/* <button
              onClick={() => handleSettingClick("Notifications")}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-notifications"
            >
              <Bell className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Notifiche</span>
              <span className="text-sm text-muted-foreground">On</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button> */}
            <a href="/privacy-policy" className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left">
              <Lock className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Privacy Policy</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </a>
            <Link href="/terms">
              <a className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left">
                <Info className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Termini di Servizio</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </a>
            </Link>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Supporto
          </h2>
          <Card className="divide-y divide-border">
            <Link href="/contact">
              <a className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left">
                <HelpCircle className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 font-medium">Centro Supporto</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </a>
            </Link>
            <Link href="/about">
              <a className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left">
                <Info className="w-5 h-5 text-muted-foreground" />
                <span className="flex-1 font-medium">About</span>
                <span className="text-sm text-muted-foreground">v0.1</span>
                <ChevronRight className="w-5 h-5 text-muted-foreground" />
              </a>
            </Link>
          </Card>
        </div>

        {user ? (
          <Button
            variant="destructive"
            onClick={handleLogout}
            className="w-full h-12"
            data-testid="button-logout"
          >
            <LogOut className="w-5 h-5 mr-2" />
            Log Out
          </Button>
        ) : (
          <Link href="/login">
            <a
              className="inline-flex items-center justify-center w-full h-12 px-4 py-2 text-sm font-medium rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors no-underline min-w-[44px] min-h-[44px]"
              data-testid="button-login-register"
            >
              Login / Register
            </a>
          </Link>
        )}
      </main>

    </div>
  );
}

function ParticipationsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["/api/me/tournaments"],
    queryFn: async () => {
      const res = await fetch("/api/me/tournaments");
      if (!res.ok) throw new Error("Failed to fetch tournaments");
      return res.json();
    },
    retry: false, // Don't retry on failures
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items: any[] = data?.tournaments || [];

  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nessun torneo trovato.</p>;
  }

  const { format } = d3Format; // We need date-fns format, assume it is imported or available. 
  // Actually Profile.tsx does not import 'format' from date-fns. I need to add it to imports or use basic date string.
  // Let's use simple string manipulation if import is missing, OR add import.
  // Looking at file content, 'format' was NOT imported.

  const formatDate = (d: string | null) => {
    if (!d) return 'Data sconosciuta';
    try {
      return new Date(d).toLocaleDateString('it-IT', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return d; }
  };

  return (
    <div className="space-y-2">
      {items.map((t) => (
        <Link key={t.tournamentId} href={`/tournaments/${encodeURIComponent(t.tournamentId)}`}>
          <a className="block no-underline">
            <Card className="p-3 cursor-pointer hover-elevate active-elevate-2 transition-colors">
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{t.name || `Torneo ${t.tournamentId}`}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(t.date)} • {t.platform === 'challonge' ? 'Challonge' : 'Challengermode'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {t.bestPlacement != null && (
                    <Badge variant="secondary" className="text-xs">Best: {t.bestPlacement}</Badge>
                  )}
                  {t.platform === 'challengermode' && (
                    <Badge variant="outline" className="text-xs">Punti: {t.totalPoints}</Badge>
                  )}
                </div>
              </div>
            </Card>
          </a>
        </Link>
      ))}
    </div>
  );
}

// Helper to avoid adding 'date-fns' import if not present
const d3Format = { format: (d: any, f: any) => "" }; 
