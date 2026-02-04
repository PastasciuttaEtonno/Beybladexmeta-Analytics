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
        title: "Error",
        description: "Please enter both email and password",
        variant: "destructive",
      });
      return;
    }
    if (!isValidEmail(sanitizedEmail)) {
      setEmailError("Invalid email format");
      toast({ title: "Invalid email", description: "Please enter a valid email", variant: "destructive" });
      return;
    }
    if (sanitizedPassword.length < 8) {
      setPasswordError("Password must be at least 8 characters");
      toast({ title: "Weak password", description: "Minimum 8 characters required", variant: "destructive" });
      return;
    }

    setLoading(true);
    try {
      await login(sanitizedEmail, sanitizedPassword);
      toast({
        title: "Welcome!",
        description: "Successfully logged in",
      });
    } catch (error) {
      const msg = error instanceof Error && error.message ? error.message : "Failed to login";
      toast({
        title: "Error",
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
          <p className="text-sm text-muted-foreground">Sign in to continue</p>
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
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                const v = e.target.value;
                setPassword(v);
                if (v && v.trim().length < 8) setPasswordError("Minimum 8 characters"); else setPasswordError(null);
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
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>

        <Button
          type="button"
          variant="outline"
          className="w-full h-12"
          onClick={() => { window.location.href = "/api/challenger/login"; }}
          data-testid="button-login-challengermode"
        >
          Sign in with Challengermode
        </Button>

        <Button
          type="button"
          variant="outline"
          className="w-full h-12 border-[#ff9100] text-[#ff9100] hover:bg-[#ff9100]/10 hover:text-[#ff9100]"
          onClick={() => { window.location.href = "/api/challonge/login"; }}
          data-testid="button-login-challonge"
        >
          Sign in with Challonge
        </Button>

        <div className="text-xs text-center text-muted-foreground">
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => setRegisterOpen(true)}
          >
            Register / Create account
          </button>
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full h-10"
          onClick={goBack}
          data-testid="button-back"
        >
          Back
        </Button>

        <Dialog open={registerOpen} onOpenChange={setRegisterOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Create your account</DialogTitle>
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
                    title: "Error",
                    description: "Please fill all fields",
                    variant: "destructive",
                  });
                  return;
                }
                if (!isValidEmail(sanitizedEmail)) {
                  setRegEmailError("Invalid email format");
                  toast({ title: "Invalid email", description: "Please enter a valid email", variant: "destructive" });
                  return;
                }
                if (!isStrongPassword(sanitizedPassword)) {
                  setRegPasswordError("Password must be 8+ chars, include upper, lower, number, special");
                  toast({ title: "Weak password", description: "Use upper, lower, number, and special character", variant: "destructive" });
                  return;
                }
                if (sanitizedDisplayName.length < 1 || sanitizedDisplayName.length > 100) {
                  setRegDisplayNameError("Display name must be 1-100 characters");
                  toast({ title: "Invalid name", description: "Use between 1 and 100 characters", variant: "destructive" });
                  return;
                }
                if (!privacyAccepted) {
                  toast({ title: "Privacy required", description: "Please read and accept the Privacy Policy", variant: "destructive" });
                  return;
                }
                if (!tosAccepted) {
                  toast({ title: "Terms required", description: "Please read and accept the Terms of Service", variant: "destructive" });
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
                    title: "Account created",
                    description: "Check your email for confirmation",
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
                <Label htmlFor="reg-name">Display name</Label>
                <Input
                  id="reg-name"
                  type="text"
                  placeholder="Your name"
                  value={regDisplayName}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRegDisplayName(v);
                    const n = v.replace(/\s+/g, " ").trim();
                    if (v && (n.length < 1 || n.length > 100)) setRegDisplayNameError("Display name must be 1-100 characters"); else setRegDisplayNameError(null);
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
                  placeholder="Choose a password"
                  value={regPassword}
                  onChange={(e) => {
                    const v = e.target.value;
                    setRegPassword(v);
                    if (v && !isStrongPassword(v)) setRegPasswordError("Use upper, lower, number, special"); else setRegPasswordError(null);
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
                  <span>I accept the Privacy Policy</span>
                </label>
                <button type="button" className="underline text-sm" onClick={() => setPrivacyOpen(true)}>Privacy Policy</button>
              </div>
              <div className="flex items-center justify-between gap-3">
                <label htmlFor="tos-accept" className="flex items-center gap-2 text-sm">
                  <input id="tos-accept" type="checkbox" checked={tosAccepted} onChange={(e) => setTosAccepted(e.target.checked)} />
                  <span>I accept the Terms of Service</span>
                </label>
                <button type="button" className="underline text-sm" onClick={() => setTosOpen(true)}>Terms of Service</button>
              </div>
              <Button type="submit" className="w-full" disabled={registering || !!regEmailError || !!regPasswordError || !!regDisplayNameError || !regEmail || !regPassword || !regDisplayName || !privacyAccepted || !tosAccepted}>
                {registering ? (recaptchaLoading ? "Verifica reCAPTCHA..." : "Registering...") : "Register"}
              </Button>
            </form>
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
                  <li>Technical Data: IP Address; Session Cookies (technical, `httpOnly`, `sameSite`); minimized technical logs used for security and debugging.</li>
                  <li>Third-Party Public Data: Public tournament and profile data from Challengermode for statistical display.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">3. Purpose and Legal Basis (Finalità e Base Giuridica)</p>
                <ul className="list-disc pl-5 space-y-2">
                  <li>Account Management & Authentication — Contractual Necessity (Art. 6.1.b)</li>
                  <li>Security & Abuse Prevention (rate limiting, reCAPTCHA) — Legitimate Interest (Art. 6.1.f)</li>
                  <li>Essential Communications (verification emails) — Contractual Necessity (Art. 6.1.b)</li>
                  <li>Statistics & Analysis (aggregate metagame data) — Legitimate Interest (Art. 6.1.f)</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">4. Data Recipients and Third Parties</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Email Provider (Resend).</li>
                  <li>Google reCAPTCHA (may set functional cookies).</li>
                  <li>Hosting and Storage providers.</li>
                  <li>External Data Sources (Challengermode).</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">5. International Data Transfers</p>
                <p>Some suppliers may be outside the EU/EEA. Appropriate safeguards (e.g., SCCs) are applied.</p>
              </div>
              <div>
                <p className="font-medium">6. Retention Period</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Account Data: retained until requested deletion.</li>
                  <li>Login and Failed Attempts: retained for limited windows (e.g., 15–30 days).</li>
                  <li>Aggregated Tournament Data: retained while the application is active.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">7. Data Security Measures</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Passwords stored using `bcrypt` hashing.</li>
                  <li>Secure session cookies with session limits.</li>
                  <li>Security headers and CSP.</li>
                  <li>reCAPTCHA anti-bot verification.</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">8. Your Rights</p>
                <ul className="list-disc pl-5 space-y-1">
                  <li>Access, Rectification, Erasure, Restriction, Objection, Portability.</li>
                </ul>
                <p>To exercise your rights, contact: <span className="underline">beybladexmeta@outlook.it</span>.</p>
                <p className="mt-2">Right to Lodge a Complaint: Garante per la Protezione dei Dati Personali — garanteprivacy.it.</p>
              </div>
              <div>
                <p className="font-medium">9. Cookies</p>
                <p>We use only technical session cookies. No profiling cookies. reCAPTCHA may set functional cookies.</p>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
