"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ambulance, LogIn, ShieldCheck, Siren, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { createClient } from "@/lib/supabase/client";
import { ROLE_HOME } from "@/lib/auth/guards";
import type { UserRole } from "@/types/database";

export function LoginForm() {
  const supabase = React.useMemo(() => createClient(), []);
  const router = useRouter();
  const toast = useToast();

  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [name, setName] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [showBootstrap, setShowBootstrap] = React.useState(false);
  const [bootstrapCode, setBootstrapCode] = React.useState("");

  async function routeByRole() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return false;
    const { data } = await supabase
      .from("users")
      .select("role")
      .eq("id", user.id)
      .single();
    const role = (data as { role?: UserRole } | null)?.role;
    if (!role) {
      toast.info("Profile not initialized yet — try again in a few seconds.");
      return false;
    }
    router.replace(ROLE_HOME[role]);
    router.refresh();
    return true;
  }

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setBusy(false);
    if (error) {
      toast.error(
        error.message === "Invalid login credentials"
          ? "Incorrect email or password."
          : error.message,
      );
      return;
    }
    await routeByRole();
  }

  async function signUp(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Sign-up failed.");
        return;
      }
      if (data.needsConfirmation) {
        toast.info("Account created. Confirm your email, then sign in.");
        setMode("signin");
        return;
      }
      await supabase.auth.signInWithPassword({ email, password });
      await routeByRole();
    } catch {
      toast.error("Network error — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  async function bootstrapAdmin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const res = await fetch("/api/auth/bootstrap-admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: bootstrapCode }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast.error(data?.error ?? "Bootstrap failed.");
        return;
      }
      toast.success("Administrator claimed. Redirecting…");
      await routeByRole();
    } catch {
      toast.error("Network error — could not reach the server.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center gap-3">
          <div
            className="flex h-12 w-12 items-center justify-center rounded-xl bg-emergency"
            aria-hidden="true"
          >
            <Siren className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="font-display text-3xl font-bold uppercase leading-none tracking-wide">
              RapidRoute
            </h1>
            <p className="text-xs uppercase tracking-[0.2em] text-ops-400">
              Emergency traffic coordination
            </p>
          </div>
        </div>

        <div
          className="mb-5 grid grid-cols-2 gap-1 rounded-lg border border-ops-700 bg-ops-900 p-1"
          role="tablist"
        >
          <button
            role="tab"
            aria-selected={mode === "signin"}
            onClick={() => setMode("signin")}
            className={`flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${mode === "signin" ? "bg-ops-700 text-white" : "text-ops-400"}`}
          >
            <LogIn className="h-4 w-4" aria-hidden="true" /> Sign in
          </button>
          <button
            role="tab"
            aria-selected={mode === "signup"}
            onClick={() => setMode("signup")}
            className={`flex h-11 items-center justify-center gap-2 rounded-md text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn ${mode === "signup" ? "bg-ops-700 text-white" : "text-ops-400"}`}
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" /> Driver account
          </button>
        </div>

        <form
          onSubmit={mode === "signin" ? signIn : signUp}
          className="space-y-4 rounded-xl border border-ops-700 bg-ops-900 p-5"
        >
          {mode === "signup" && (
            <div>
              <Label htmlFor="name">Full name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                minLength={2}
                maxLength={80}
                autoComplete="name"
              />
            </div>
          )}
          <div>
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </div>
          <div>
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={
                mode === "signin" ? "current-password" : "new-password"
              }
            />
            {mode === "signup" && (
              <p className="mt-1 text-xs text-ops-400">Minimum 8 characters.</p>
            )}
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? "Sign in" : "Create driver account"}
          </Button>
          {mode === "signup" && (
            <p className="flex items-start gap-2 text-xs text-ops-400">
              <Ambulance
                className="mt-0.5 h-3.5 w-3.5 shrink-0"
                aria-hidden="true"
              />
              Public sign-up creates ambulance driver accounts only. Police and
              admin accounts are provisioned by an administrator.
            </p>
          )}
        </form>

        <div className="mt-4">
          <button
            type="button"
            onClick={() => setShowBootstrap((v) => !v)}
            className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ops-400 hover:text-ops-300"
          >
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" /> First-run
            admin bootstrap
          </button>
          {showBootstrap && (
            <form
              onSubmit={bootstrapAdmin}
              className="mt-3 space-y-3 rounded-xl border border-ops-700 bg-ops-900 p-4"
            >
              <p className="text-xs text-ops-400">
                Sign in first, then enter the server&apos;s{" "}
                <code className="text-ops-300">ADMIN_BOOTSTRAP_CODE</code>.
                Works only once — when no administrator exists yet.
              </p>
              <Input
                type="password"
                value={bootstrapCode}
                onChange={(e) => setBootstrapCode(e.target.value)}
                placeholder="Bootstrap code"
                aria-label="Admin bootstrap code"
              />
              <Button
                type="submit"
                variant="outline"
                className="w-full"
                disabled={busy}
              >
                Claim administrator role
              </Button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
