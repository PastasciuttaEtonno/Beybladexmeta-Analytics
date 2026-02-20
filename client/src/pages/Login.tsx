import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeProvider";
import { Seo } from "@/components/Seo";

// Helpers for sanitization and validation
const normalizeEmail = (s: string) => s.trim().toLowerCase();
const RECAPTCHA_SITE_KEY: string | undefined = process.env.VITE_RECAPTCHA_SITE_KEY;

function resolveRecaptchaSiteKey(): string | null {
  if (RECAPTCHA_SITE_KEY && typeof RECAPTCHA_SITE_KEY === "string" && RECAPTCHA_SITE_KEY.length > 0) {
    return RECAPTCHA_SITE_KEY;
  }
  const script = document.querySelector('script[src*="https://www.google.com/recaptcha/api.js"]') as HTMLScriptElement | null;
  if (script?.src) {
    try {
      const url = new URL(script.src);
      const key = url.searchParams.get("render");
      if (key) return key;
    } catch { }
  }
  return null;
}

async function ensureRecaptchaReady(maxWaitMs: number = 15000): Promise<void> {
  const w = window as any;
  // Wait for the v3 client loaded via index.html
  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      if (w.grecaptcha && typeof w.grecaptcha.ready === "function") {
        clearInterval(timer);
        try {
          w.grecaptcha.ready(() => resolve());
        } catch {
          resolve();
        }
      } else if (elapsed >= maxWaitMs) {
        clearInterval(timer);
        reject(new Error("reCAPTCHA non disponibile"));
      }
    }, 100);
  });
}
const isValidEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isStrongPassword = (s: string) => (
  s.trim().length >= 8 && /[a-z]/.test(s) && /[A-Z]/.test(s) && /[0-9]/.test(s) && /[^A-Za-z0-9]/.test(s)
);

export default function Login() {
  const { user, login } = useAuth();
  const { toast } = useToast();
  const { theme } = useTheme();
  const [, setLocation] = useLocation();
  const goBack = () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      setLocation("/");
    }
  };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [regEmail, setRegEmail] = useState("");
  const [regDisplayName, setRegDisplayName] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [registering, setRegistering] = useState(false);
  const [recaptchaReady, setRecaptchaReady] = useState(false);
  const [recaptchaLoading, setRecaptchaLoading] = useState(false);
  const [regEmailError, setRegEmailError] = useState<string | null>(null);
  const [regPasswordError, setRegPasswordError] = useState<string | null>(null);
  const [regDisplayNameError, setRegDisplayNameError] = useState<string | null>(null);
  const [privacyOpen, setPrivacyOpen] = useState(false);
  const [privacyAccepted, setPrivacyAccepted] = useState(false);
  const [tosOpen, setTosOpen] = useState(false);
  const [tosAccepted, setTosAccepted] = useState(false);

  useEffect(() => {
    if (user) {
      setLocation("/");
    }
  }, [user, setLocation]);

  // Pre-carica reCAPTCHA on mount per evitare ritardi al submit
  // Ignora eventuali errori: saranno gestiti al submit
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setRecaptchaLoading(true);
        await ensureRecaptchaReady(15000);
        if (mounted) setRecaptchaReady(true);
      } catch {
        if (mounted) setRecaptchaReady(false);
      } finally {
        if (mounted) setRecaptchaLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const sanitizedEmail = normalizeEmail(email);
    const sanitizedPassword = password.trim();

    if (!sanitizedEmail || !sanitizedPassword) {
      toast({
        title: "Errore",
        description: "Inserisci sia l'email che la password",
        variant: "destructive",
      });
      return;
    }
    if (!isValidEmail(sanitizedEmail)) {
      setEmailError("Formato email non valido");
      toast({ title: "Email non valida", description: "Inserisci un indirizzo email valido", variant: "destructive" });
      return;
    }
    if (sanitizedPassword.length < 8) {
      setPasswordError("La password deve avere almeno 8 caratteri");
      toast({ title: "Password debole", description: "Minimo 8 caratteri richiesti", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await login(sanitizedEmail, sanitizedPassword);
      toast({
        title: "Benvenuto!",
        description: "Accesso effettuato con successo",
      });
    } catch (error) {
      const msg = error instanceof Error && error.message ? error.message : "Accesso fallito";
      toast({
        title: "Errore",
        description: msg,
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Seo
        title="Login · Beybladexmeta Analytics"
        description="Accedi al tuo account Beybladexmeta Analytics"
        robots="noindex, nofollow"
      />
      <div className="w-full max-w-sm space-y-8">
        <div className="flex flex-col items-center text-center space-y-3">
          <img
            src={theme === "dark" ? "/meta logoWhite.svg" : "/meta logo.svg"}
            alt="Logo"
            className="h-28 w-18"
            data-testid="img-logo"
          />
          <p className="text-sm text-muted-foreground">Accedi per continuare</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              placeholder="you@email.com"
              value={email}
              onChange={(e) => {
                const v = e.target.value;
                setEmail(v);
                const n = normalizeEmail(v);
                if (v && !isValidEmail(n)) setEmailError("Invalid email format"); else setEmailError(null);
              }}
              className="h-12"
              data-testid="input-email"
              disabled={loading}
            />
            {emailError && (
              <p className="text-xs text-destructive" aria-live="polite">{emailError}</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              placeholder="Inserisci la tua password"
              value={password}
              onChange={(e) => {
                const v = e.target.value;
                setPassword(v);
                if (v && v.trim().length < 8) setPasswordError("Minimo 8 caratteri"); else setPasswordError(null);
              }}
              className="h-12"
              data-testid="input-password"
              disabled={loading}
            />
            {passwordError && (
              <p className="text-xs text-destructive" aria-live="polite">{passwordError}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full h-12"
            disabled={loading || !!emailError || !!passwordError || !email || !password}
            data-testid="button-login"
          >
            {loading ? "Accesso in corso..." : "Accedi"}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          className="w-full h-12"
          onClick={() => { window.location.href = "/api/challenger/login"; }}
          data-testid="button-login-challengermode"
        >
          Autenticati con Challengermode
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-12 border-[#ff9100] text-[#ff9100] hover:bg-[#ff9100]/10 hover:text-[#ff9100]"
          onClick={() => { window.location.href = "/api/challonge/login"; }}
          data-testid="button-login-challonge"
        >
          Autenticati con Challonge
        </Button>

        <div className="text-xs text-center text-muted-foreground">
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => setRegisterOpen(true)}
          >
            Registrati / Crea account
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full h-10"
          onClick={goBack}
          data-testid="button-back"
        >
          Indietro
        </Button>

        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Crea il tuo account</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault();
                const sanitizedEmail = normalizeEmail(regEmail);
                const sanitizedPassword = regPassword.trim();
                const sanitizedDisplayName = regDisplayName.replace(/\s+/g, " ").trim();

                if (!sanitizedEmail || !sanitizedPassword || !sanitizedDisplayName) {
                  toast({
                    title: "Errore",
                    description: "Compila tutti i campi",
                    variant: "destructive",
                  });
                  return;
                }
                if (!isValidEmail(sanitizedEmail)) {
                  setRegEmailError("Formato email non valido");
                  toast({ title: "Email non valida", description: "Inserisci un indirizzo email valido", variant: "destructive" });
                  return;
                }
                if (!isStrongPassword(sanitizedPassword)) {
                  setRegPasswordError("La password deve contenere 8+ caratteri, una maiuscola, una minuscola, un numero e un carattere speciale");
                  toast({ title: "Password debole", description: "Usa maiuscole, minuscole, numeri e caratteri speciali", variant: "destructive" });
                  return;
                }
                if (sanitizedDisplayName.length < 1 || sanitizedDisplayName.length > 100) {
                  setRegDisplayNameError("Il nome visualizzato deve essere tra 1 e 100 caratteri");
                  toast({ title: "Nome non valido", description: "Usa tra 1 e 100 caratteri", variant: "destructive" });
                  return;
                }
                if (!privacyAccepted) {
                  toast({ title: "Privacy richiesta", description: "Leggi e accetta la Privacy Policy", variant: "destructive" });
                  return;
                }
                if (!tosAccepted) {
                  toast({ title: "Termini richiesti", description: "Leggi e accetta i Termini di Servizio", variant: "destructive" });
                  return;
                }
                setRegistering(true);
                try {
                  // Ensure reCAPTCHA is loaded and ready
                  try {
                    setRecaptchaLoading(true);
                    await ensureRecaptchaReady(15000);
                    setRecaptchaReady(true);
                  } catch (e) {
                    setRecaptchaReady(false);
                    throw new Error("reCAPTCHA non disponibile. Verifica connessione, ad-block e riprova.");
                  } finally {
                    setRecaptchaLoading(false);
                  }
                  const grecaptcha = (window as any).grecaptcha;
                  if (!grecaptcha || typeof grecaptcha.execute !== "function") {
                    throw new Error("reCAPTCHA client not available. Check ad-blockers or CSP.");
                  }
                  const siteKey = resolveRecaptchaSiteKey();
                  if (!siteKey) {
                    throw new Error("Missing reCAPTCHA site key. Configure VITE_RECAPTCHA_SITE_KEY or script render.");
                  }
                  const captchaToken: string = await grecaptcha.execute(siteKey, { action: "register" });

                  const res = await fetch("/api/auth/register", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      email: sanitizedEmail,
                      password: sanitizedPassword,
                      displayName: sanitizedDisplayName,
                      captchaToken,
                    }),
                  });
                  if (!res.ok) {
                    const data = await res.json().catch(() => ({}));
                    throw new Error(data.error || "Failed to register");
                  }
                  toast({
                    title: "Account creato",
                    description: "Controlla la tua email per la conferma",
                  });
                  setRegisterOpen(false);
                  // Prefill email field on login for convenience
                  setEmail(sanitizedEmail);
                } catch (err: any) {
                  toast({
                    title: "Error",
                    description: err.message || "Registration failed",
                    variant: "destructive",
                  });
                } finally {
                  setRegistering(false);
                }
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="reg-email">Email</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="you@email.com"
                  value={regEmail}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRegEmail(v);
                    const n = normalizeEmail(v);
                    if (v && !isValidEmail(n)) setRegEmailError("Invalid email format"); else setRegEmailError(null);
                  }}
                  disabled={registering}
                />
                {regEmailError && (
                  <p className="text-xs text-destructive" aria-live="polite">{regEmailError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-name">Nome visualizzato</Label>
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="Il tuo nome"
                  value={regDisplayName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRegDisplayName(v);
                    const n = v.replace(/\s+/g, " ").trim();
                    if (v && (n.length < 1 || n.length > 100)) setRegDisplayNameError("Il nome deve essere tra 1 e 100 caratteri"); else setRegDisplayNameError(null);
                  }}
                  disabled={registering}
                />
                {regDisplayNameError && (
                  <p className="text-xs text-destructive" aria-live="polite">{regDisplayNameError}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Password</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Scegli una password"
                  value={regPassword}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRegPassword(v);
                    if (v && !isStrongPassword(v)) setRegPasswordError("Usa maiuscole, minuscole, numeri e speciali"); else setRegPasswordError(null);
                  }}
                  disabled={registering}
                />
                {regPasswordError && (
                  <p className="text-xs text-destructive" aria-live="polite">{regPasswordError}</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="privacy-accept" className="flex items-center gap-2 text-sm">
                  <input id="privacy-accept" type="checkbox" checked={privacyAccepted} onChange={(e) => setPrivacyAccepted(e.target.checked)} />
                  <span>Accetto la Privacy Policy</span>
                </label>
                <button type="button" className="underline text-sm" onClick={() => setPrivacyOpen(true)}>Leggi</button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tos-accept" className="flex items-center gap-2 text-sm">
                  <input id="tos-accept" type="checkbox" checked={tosAccepted} onChange={(e) => setTosAccepted(e.target.checked)} />
                  <span>Accetto i Termini di Servizio</span>
                </label>
                <button type="button" className="underline text-sm" onClick={() => setTosOpen(true)}>Leggi</button>
              </div>
              <Button type="submit" className="w-full" disabled={registering || !!regEmailError || !!regPasswordError || !!regDisplayNameError || !regEmail || !regPassword || !regDisplayName || !privacyAccepted || !tosAccepted}>
                {registering ? (recaptchaLoading ? "Verifica reCAPTCHA..." : "Registrazione in corso...") : "Registrati"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
        <Dialog open={tosOpen} onOpenChange={setTosOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Termini di Servizio</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>Questi Termini disciplinano l'utilizzo dell'applicazione da parte dell'utente.</p>
              <div>
                <p className="font-medium">1. Accettazione</p>
                <p>Creando un account o utilizzando il Servizio, accetti i presenti Termini.</p>
              </div>
              <div>
                <p className="font-medium">2. Utilizzo del Servizio</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Non abusare, interrompere o tentare di eludere la sicurezza o i limiti di frequenza.</li>
                  <li>I contenuti sono forniti a scopo informativo; l'accuratezza non è garantita.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">3. Account</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Sei responsabile della protezione delle tue credenziali.</li>
                  <li>Possiamo sospendere gli account che violano questi Termini o la legge.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">4. Dati e Privacy</p>
                <p>I dati personali sono trattati come descritto nella Privacy Policy.</p>
              </div>
              <div>
                <p className="font-medium">5. Proprietà Intellettuale</p>
                <p>I marchi e i contenuti di terze parti appartengono ai rispettivi proprietari.</p>
              </div>
              <div>
                <p className="font-medium">6. Responsabilità</p>
                <p>Il Servizio è fornito "as is". Non siamo responsabili per danni indiretti o consequenziali.</p>
              </div>
              <div>
                <p className="font-medium">7. Modifiche</p>
                <p>Potremmo aggiornare questi Termini. L'uso continuato costituisce accettazione delle modifiche.</p>
              </div>
              <div>
                <p className="font-medium">8. Contatti</p>
                <p>Per domande, contatta: <span className="underline">beybladexmeta@outlook.it</span>.</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={privacyOpen} onOpenChange={setPrivacyOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[70vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Privacy Policy</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 text-sm">
              <p>
                Questa Privacy Policy descrive come il Titolare raccoglie, utilizza e protegge i tuoi dati personali quando utilizzi questa applicazione (il "Servizio").
              </p>
              <div>
                <p className="font-medium">1. Titolare del Trattamento</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Email di contatto: beybladexmeta@outlook.it</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">2. Dati Trattati</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Dati dell'Account: Indirizzo email e identificativo unico (ID) per l'autenticazione e la gestione dell'account.</li>
                  <li>Dati Tecnici: Indirizzo IP; Cookie di sessione; log tecnici minimizzati per sicurezza e debug.</li>
                  <li>Dati Pubblici di Terze Parti: Dati pubblici di tornei e profili ottenuti da Challengermode per visualizzazione statistica.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">3. Finalità e Base Giuridica</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Gestione Account e Autenticazione — Necessità Contrattuale (Art. 6.1.b GDPR)</li>
                  <li>Sicurezza e Prevenzione Abusi (rate limiting, reCAPTCHA) — Legittimo Interesse (Art. 6.1.f GDPR)</li>
                  <li>Comunicazioni Essenziali (email di verifica) — Necessità Contrattuale (Art. 6.1.b GDPR)</li>
                  <li>Statistiche e Analisi (dati aggregati sul metagame) — Legittimo Interesse (Art. 6.1.f GDPR)</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">4. Trasferimento Dati Extra-UE</p>
                <p>Alcuni fornitori potrebbero avere sede fuori dall'UE/SEE. Vengono applicate le salvaguardie adeguate (es. SCCs).</p>
              </div>
              <div>
                <p className="font-medium">5. Periodo di Conservazione</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Dati Account: conservati fino alla richiesta di cancellazione.</li>
                  <li>Log di sicurezza: conservati per finestre temporali limitate (es. 30 giorni).</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">6. Diritti dell'Interessato</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Accesso, Rettifica, Cancellazione, Limitazione, Opposizione, Portabilità.</li>
                </ul>
                <p>Per esercitare i tuoi diritti, contatta: <span className="underline">beybladexmeta@outlook.it</span>.</p>
              </div>
              <div>
                <p className="font-medium">7. Cookie</p>
                <p>Utilizziamo solo cookie tecnici di sessione. Nessun cookie di profilazione proprietario.</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
