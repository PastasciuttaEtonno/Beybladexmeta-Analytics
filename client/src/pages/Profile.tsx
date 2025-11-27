import { useState, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { PageHeader } from "@/components/PageHeader";
import { HeaderLogo } from "@/components/HeaderLogo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
// import { Avatar } from "@/components/Avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { useTheme } from "@/contexts/ThemeProvider";
import { useToast } from "@/hooks/use-toast";
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
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [tosOpen, setTosOpen] = useState(false);


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

  return (
    <div className="flex flex-col min-h-screen bg-background pb-20">
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
            {!user?.challengerId && (
              <div className="mt-3 mb-3">
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => { window.location.href = "/api/challenger/login"; }}
                >
                  Collega account Challengermode
                </Button>
              </div>
            )}
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
                className={`w-12 h-6 rounded-full transition-colors ${
                  theme === "dark" ? "bg-primary" : "bg-muted"
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    theme === "dark" ? "translate-x-6" : "translate-x-0.5"
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
            <button
              onClick={() => setPrivacyOpen(true)}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-privacy"
            >
              <Lock className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Privacy</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => setTosOpen(true)}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-tos"
            >
              <Info className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Terms of Service</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
          </Card>
        </div>

        <div className="space-y-3">
          <h2 className="text-sm font-medium text-muted-foreground px-1">
            Supporto
          </h2>
          <Card className="divide-y divide-border">
            <button
              onClick={() => handleSettingClick("Help Center")}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-help-center"
            >
              <HelpCircle className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">Centro Supporto</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
            <button
              onClick={() => handleSettingClick("About")}
              className="w-full p-4 flex items-center gap-3 hover-elevate active-elevate-2 text-left"
              data-testid="button-about"
            >
              <Info className="w-5 h-5 text-muted-foreground" />
              <span className="flex-1 font-medium">About</span>
              <span className="text-sm text-muted-foreground">v0.1</span>
              <ChevronRight className="w-5 h-5 text-muted-foreground" />
            </button>
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
          <Button
            onClick={() => setLocation("/login")}
            className="w-full h-12"
            data-testid="button-login-register"
          >
            Login / Register
          </Button>
        )}
      </main>
      <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Privacy Policy</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p>
              This Privacy Policy describes how the Data Controller collects, uses, and protects your personal data when you use this application (the "Service").
            </p>

            <div>
              <p className="font-medium">1. Data Controller (Titolare del Trattamento)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Contact Email: beybladexmeta@outlook.it</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">2. Data We Process (Dati Trattati)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Account Data: Email address and unique User Identifier (ID) for authentication and account management.</li>
                <li>Technical Data: IP Address (for security, abuse prevention, and rate limiting); Session Cookies ; minimized technical logs of requests (date, time, action) used for security and debugging.</li>
                <li>Third-Party Public Data: Public tournament and profile data retrieved from sources like Challengermode, processed solely for statistical display and metagame analysis.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">3. Purpose and Legal Basis (Finalità e Base Giuridica)</p>
              <ul className="list-disc pl-5 space-y-2">
                <li>
                  Account Management & Authentication — Legal Basis: Contractual Necessity (Art. 6.1.b)
                </li>
                <li>
                  Security & Abuse Prevention (rate limiting, reCAPTCHA) — Legal Basis: Legitimate Interest (Art. 6.1.f)
                </li>
                <li>
                  Essential Communications (verification emails) — Legal Basis: Contractual Necessity (Art. 6.1.b)
                </li>
                <li>
                  Statistics & Analysis (aggregate metagame data) — Legal Basis: Legitimate Interest (Art. 6.1.f)
                </li>
              </ul>
            </div>

            <div>
              <p className="font-medium">4. Data Recipients and Third Parties (Destinatari e Terze Parti)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Email Provider for essential communications.</li>
                <li>Google reCAPTCHA for anti-bot protection (may set functional cookies).</li>
                <li>Hosting and Storage Services for infrastructure and database.</li>
                <li>External Data Sources (Challengermode) for public tournament and profile data.</li>
                <li>BeybladeWiki for images.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">5. International Data Transfers (Trasferimenti Extra-UE)</p>
              <p>
                Some suppliers may be located outside the EU/EEA. Appropriate safeguards are applied (e.g., Standard Contractual Clauses) as required by law.
              </p>
            </div>

            <div>
              <p className="font-medium">6. Retention Period (Conservazione)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Account Data: retained until the user requests account deletion.</li>
                <li>Login and Failed Attempts: retained for limited windows (e.g., 15–30 days) for security/abuse monitoring.</li>
                <li>Aggregated Tournament Data: retained for statistical purposes while the application is active.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">7. Data Security Measures (Sicurezza)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Passwords stored using strong hashing.</li>
                <li>Secure, protected session cookies with session limits.</li>
                <li>Security headers and Content Security Policy (CSP).</li>
                <li>Anti-bot verification via reCAPTCHA.</li>
              </ul>
            </div>

            <div>
              <p className="font-medium">8. Your Rights (Diritti dell’Interessato)</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Right of Access</li>
                <li>Right to Rectification</li>
                <li>Right to Erasure (Right to be Forgotten)</li>
                <li>Right to Restriction of Processing</li>
                <li>Right to Object (e.g., processing based on legitimate interest)</li>
                <li>Right to Data Portability</li>
              </ul>
              <p>

                To exercise your rights, contact: <span className="underline">beybladexmeta@outlook.it</span>.
              </p>
              <p className="mt-2">
                Right to Lodge a Complaint: You may lodge a complaint with the competent supervisory authority (in Italy, the Garante per la Protezione dei Dati Personali — garanteprivacy.it).
              </p>
            </div>

            <div>
              <p className="font-medium">9. Cookies</p>
              <p>
                We only use technical session cookies essential for the Service. We do not use profiling or marketing cookies. Google reCAPTCHA may set functional cookies for its anti-bot protection service.
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog open={tosOpen} onOpenChange={setTosOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Terms of Service</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <p>These Terms govern the use of the application by the user.</p>
            <div>
              <p className="font-medium">1. Acceptance</p>
              <p>By creating an account or using the Service, you agree to these Terms.</p>
            </div>
            <div>
              <p className="font-medium">2. Use of the Service</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Do not abuse, disrupt, or attempt to circumvent security or rate limits.</li>
                <li>Content is provided for informational purposes; accuracy is not guaranteed.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">3. Accounts</p>
              <ul className="list-disc pl-5 space-y-1">
                <li>You are responsible for safeguarding your account credentials.</li>
                <li>We may suspend accounts that violate these Terms or the law.</li>
              </ul>
            </div>
            <div>
              <p className="font-medium">4. Data & Privacy</p>
              <p>Personal data is processed as described in the Privacy Policy.</p>
            </div>
            <div>
              <p className="font-medium">5. Intellectual Property</p>
              <p>Trademarks and third-party content belong to their respective owners.</p>
            </div>
            <div>
              <p className="font-medium">6. Liability</p>
              <p>The Service is provided “as is”. We are not liable for indirect or consequential damages.</p>
            </div>
            <div>
              <p className="font-medium">7. Changes</p>
              <p>We may update these Terms. Continued use of the Service constitutes acceptance of changes.</p>
            </div>
            <div>
              <p className="font-medium">8. Contact</p>
              <p>For questions, contact: <span className="underline">beybladexmeta@outlook.it</span>.</p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ParticipationsList() {
  const { data, isLoading } = useQuery({
    queryKey: ["cm-participations"],
    queryFn: async () => {
      const res = await fetch("/api/challenger/participations");
      if (!res.ok) throw new Error("Failed to fetch participations");
      return res.json();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }
  const items: any[] = data?.participations || [];
  if (!items.length) {
    return <p className="text-sm text-muted-foreground">Nessun torneo trovato.</p>;
  }
  const scroll = items.length > 5;
  return (
    <div className={`space-y-2 ${scroll ? 'max-h-64 overflow-y-auto pr-1' : ''}`}>
      {items.map((t) => (
        <div key={t.tournamentId} className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium">{t.name || t.tournamentId}</p>
            {/* date hidden to avoid sensitive details */}
          </div>
          {t.hasCombos ? (
            <span className="text-xs text-green-600">Combo presenti</span>
          ) : null}
        </div>
      ))}
    </div>
  );
}
