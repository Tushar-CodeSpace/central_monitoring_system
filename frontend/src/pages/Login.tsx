import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Activity, Lock, Mail } from "lucide-react";
import { login } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function Login() {
  const navigate = useNavigate();
  const { reload } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await login(email, password);
      await reload();
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950">
      <div className="pointer-events-none absolute -top-32 left-1/2 h-96 w-[42rem] -translate-x-1/2 rounded-full bg-emerald-500/15 blur-3xl"></div>
      <div className="pointer-events-none absolute bottom-0 right-0 h-72 w-96 rounded-full bg-sky-500/10 blur-3xl"></div>

      <div className="relative w-full max-w-sm">
        <div className="mb-6 flex items-center justify-center gap-2">
          <div className="relative">
            <span className="absolute inset-0 rounded-xl bg-emerald-500/40 blur-lg"></span>
            <div className="relative rounded-xl border border-emerald-400/30 bg-slate-900 p-2">
              <Activity className="h-7 w-7 text-emerald-400" />
            </div>
          </div>
          <span className="text-xl font-semibold tracking-tight">
            Octyn <span className="text-emerald-400">Watcher</span>
          </span>
        </div>

        <div className="rounded-2xl border border-slate-800/80 bg-slate-900/70 p-8 shadow-2xl shadow-black/40 backdrop-blur">
          <h1 className="text-lg font-semibold">Welcome back</h1>
          <p className="mb-6 mt-1 text-sm text-slate-400">Sign in to the monitoring console</p>

          <form onSubmit={onSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="email">Email</Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="email"
                  type="email"
                  required
                  className="pl-9"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@monitoring.com"
                />
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="password">Password</Label>
              <div className="relative">
                <Lock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                <Input
                  id="password"
                  type="password"
                  required
                  className="pl-9"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            </div>
            {error && (
              <p className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                {error}
              </p>
            )}
            <Button type="submit" disabled={loading} size="lg" className="mt-1">
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}