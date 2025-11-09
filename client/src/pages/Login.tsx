import { useState, useEffect } from "react";
import { useAuth } from "@/contexts/AuthContext";
import { Redirect } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useTheme } from "@/contexts/ThemeProvider";

// Helpers for sanitization and validation
const normalizeEmail = (s: string) => s.trim().toLowerCase();
// Read site key and mode from environment to avoid hardcoding secrets
const RECAPTCHA_SITE_KEY = import.meta.env.VITE_RECAPTCHA_SITE_KEY as string | undefined;
const USE_ENTERPRISE = (import.meta.env.VITE_RECAPTCHA_USE_ENTERPRISE as string | undefined) === "true";

async function ensureRecaptchaReady(maxWaitMs: number = 15000): Promise<void> {
  if (!RECAPTCHA_SITE_KEY) {
    throw new Error("Missing VITE_RECAPTCHA_SITE_KEY environment variable");
  }
  const w = window as any;
  // Already available
  if (USE_ENTERPRISE) {
    if (w.grecaptcha && w.grecaptcha.enterprise && typeof w.grecaptcha.enterprise.execute === "function") {
      try {
        await new Promise<void>((resolve) => w.grecaptcha.enterprise.ready(() => resolve()));
      } catch {
        // ignore
      }
      return;
    }
  } else {
    if (w.grecaptcha && typeof w.grecaptcha.execute === "function") {
      try {
        await new Promise<void>((resolve) => w.grecaptcha.ready(() => resolve()));
      } catch {
        // ignore
      }
      return;
    }
  }

  // Inject the appropriate script if not present, with fallback to recaptcha.net
  const primarySrc = USE_ENTERPRISE
    ? `https://www.google.com/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`
    : `https://www.google.com/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
  const fallbackSrc = USE_ENTERPRISE
    ? `https://www.recaptcha.net/recaptcha/enterprise.js?render=${RECAPTCHA_SITE_KEY}`
    : `https://www.recaptcha.net/recaptcha/api.js?render=${RECAPTCHA_SITE_KEY}`;
  const existing = document.querySelector(
    `script[src*="recaptcha/"]`
  ) as HTMLScriptElement | null;
  if (!existing) {
    const inject = (src: string) => new Promise<void>((resolve, reject) => {
      const s = document.createElement("script");
      s.src = src;
      s.async = true;
      s.defer = true;
      s.onload = () => resolve();
      s.onerror = () => reject(new Error(`Failed to load reCAPTCHA script: ${src}`));
      document.head.appendChild(s);
    });
    try {
      await inject(primarySrc);
    } catch {
      // Try fallback domain immediately if primary fails to load
      await inject(fallbackSrc);
    }
  }

  // Poll until grecaptcha becomes available, inject fallback if it takes too long
  await new Promise<void>((resolve, reject) => {
    const start = Date.now();
    let fallbackInjected = false;
    const timer = setInterval(async () => {
      const elapsed = Date.now() - start;
      const ready = USE_ENTERPRISE
        ? (w.grecaptcha && w.grecaptcha.enterprise && typeof w.grecaptcha.enterprise.execute === "function")
        : (w.grecaptcha && typeof w.grecaptcha.execute === "function");
      if (ready) {
        clearInterval(timer);
        try {
          (USE_ENTERPRISE ? w.grecaptcha.enterprise : w.grecaptcha).ready(() => resolve());
        } catch {
          resolve();
        }
      } else if (!fallbackInjected && elapsed >= Math.min(5000, Math.floor(maxWaitMs / 2))) {
        fallbackInjected = true;
        // If no script from fallback domain, try injecting it
        const hasFallback = !!document.querySelector(`script[src*="recaptcha.net/recaptcha/"]`);
        if (!hasFallback) {
          const s = document.createElement("script");
          s.src = fallbackSrc;
          s.async = true;
          s.defer = true;
          s.onload = () => {/* no-op, continue polling */};
          document.head.appendChild(s);
        }
      } else if (elapsed >= maxWaitMs) {
        clearInterval(timer);
        reject(new Error("reCAPTCHA not available"));
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
  // Show a message when coming from email verification link
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("verified") === "true") {
      toast({
        title: "Email verified",
        description: "You can now sign in",
      });
    }
  }, []);

  // Preload reCAPTCHA on mount to avoid submit delays
  useEffect(() => {
    let isMounted = true;
    (async () => {
      try {
        setRecaptchaLoading(true);
        await ensureRecaptchaReady(15000);
        if (isMounted) setRecaptchaReady(true);
      } catch {
        if (isMounted) setRecaptchaReady(false);
      } finally {
        if (isMounted) setRecaptchaLoading(false);
      }
    })();
    return () => { isMounted = false; };
  }, []);

  if (user) {
    return <Redirect to="/" />;
  }

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
      toast({
        title: "Error",
        description: "Failed to login",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
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

        <div className="text-xs text-center text-muted-foreground">
          <button
            type="button"
            className="underline underline-offset-4 hover:text-foreground"
            onClick={() => setRegisterOpen(true)}
          >
            Register / Create account
          </button>
        </div>

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
                  const executor = USE_ENTERPRISE ? grecaptcha.enterprise : grecaptcha;
                  // Ensure the internal reCAPTCHA is fully initialized before executing
                  await new Promise<void>((resolve) => {
                    try {
                      executor.ready(() => resolve());
                    } catch {
                      resolve();
                    }
                  });
                  const captchaToken: string = await executor.execute(RECAPTCHA_SITE_KEY, { action: "register" });

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
                    description: "Check your email to confirm your account, then sign in.",
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
              <Button type="submit" className="w-full" disabled={registering || !!regEmailError || !!regPasswordError || !!regDisplayNameError || !regEmail || !regPassword || !regDisplayName}>
                {registering ? (recaptchaLoading ? "Verifica reCAPTCHA..." : "Registering...") : "Register"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
