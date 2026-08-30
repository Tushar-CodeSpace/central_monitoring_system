import { useEffect, useState } from "react";
import { Key, Lock, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { showToast } from "@/components/ToastHost";
import type { AlertConfig } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const FIELDS: {
  key: Exclude<keyof AlertConfig, "config_sync_enabled">;
  label: string;
  hint: string;
  min: number;
  max?: number;
}[] = [
  {
    key: "ram_threshold_percent",
    label: "Memory alert threshold (%)",
    hint: "Raise a warning when a server's memory usage exceeds this share of total RAM.",
    min: 0,
    max: 100,
  },
  {
    key: "cpu_threshold_percent",
    label: "CPU alert threshold (%)",
    hint: "CPU level that starts counting towards a sustained-CPU warning.",
    min: 0,
    max: 100,
  },
  {
    key: "cpu_duration_seconds",
    label: "CPU sustained window (seconds)",
    hint: "How long CPU must stay above its threshold before the warning fires.",
    min: 30,
  },
  {
    key: "disk_threshold_percent",
    label: "Disk alert threshold (%)",
    hint: "Raise a warning when a server's disk usage exceeds this share.",
    min: 0,
    max: 100,
  },
  {
    key: "api_error_threshold_percent",
    label: "API Error alert threshold (%)",
    hint: "Trigger an alert if HTTP 400-500 errors exceed this percentage of total API calls across site microservices.",
    min: 0,
    max: 100,
  },
  {
    key: "offline_threshold_seconds",
    label: "Server Offline Heartbeat Timeout (seconds)",
    hint: "If a site server stops sending heartbeats for longer than this duration, log a Critical Server Offline alert.",
    min: 15,
  },
  {
    key: "config_sync_interval_seconds",
    label: "Site config backup interval (seconds)",
    hint: "How often site agents upload MongoDB config snapshots to the hub. Agents pick up changes on their next heartbeat.",
    min: 60,
  },
];

export default function Settings() {
  const { user: currentUser, isAdmin } = useAuth();
  const [form, setForm] = useState<AlertConfig | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Personal Password Change State
  const [passForm, setPassForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPass, setChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<AlertConfig>("/settings")
      .then(setForm)
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load settings")
      );
  }, []);

  async function handleChangeMyPassword(e: React.FormEvent) {
    e.preventDefault();
    setPassError(null);
    if (!passForm.currentPassword || !passForm.newPassword) return;
    if (passForm.newPassword !== passForm.confirmPassword) {
      setPassError("New password and confirm password do not match.");
      return;
    }
    if (passForm.newPassword.length < 8) {
      setPassError("New password must be at least 8 characters long.");
      return;
    }

    setChangingPass(true);
    try {
      await apiFetch<{ message: string }>("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({
          current_password: passForm.currentPassword,
          new_password: passForm.newPassword,
        }),
      });
      setPassForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      showToast({
        severity: "info",
        title: "Password Updated",
        message: "Your password has been changed successfully.",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to change password";
      setPassError(msg);
      showToast({
        severity: "critical",
        title: "Change Password Failed",
        message: msg,
      });
    } finally {
      setChangingPass(false);
    }
  }

  function update(key: Exclude<keyof AlertConfig, "config_sync_enabled">, raw: string) {
    setForm((prev) => (prev ? { ...prev, [key]: Number(raw) } : prev));
  }

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const saved = await apiFetch<AlertConfig>("/settings", {
        method: "PATCH",
        body: JSON.stringify(form),
      });
      setForm(saved);
      showToast({
        severity: "info",
        title: "Settings saved",
        message: "New thresholds apply from the next evaluation cycle (≤ 5s).",
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Save failed",
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400">Personal account security and central alert thresholds</p>
      </div>

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}

      {/* Personal Account & Password Change Section (For ALL Users) */}
      <Card className="max-w-2xl border-sky-500/30 bg-slate-900/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <Lock className="h-4 w-4 text-sky-400" />
            My Profile & Password Settings
          </CardTitle>
          <p className="text-xs text-slate-400">
            Logged in as <span className="font-semibold text-slate-200">{currentUser?.email}</span> (
            <span className="text-sky-400 font-medium capitalize">{currentUser?.role}</span>). Update your account password below.
          </p>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleChangeMyPassword} className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-400">Current Password *</Label>
                <Input
                  type="password"
                  required
                  placeholder="Current password"
                  value={passForm.currentPassword}
                  onChange={(e) => setPassForm({ ...passForm, currentPassword: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-400">New Password *</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Min 8 chars"
                  value={passForm.newPassword}
                  onChange={(e) => setPassForm({ ...passForm, newPassword: e.target.value })}
                />
              </div>
              <div className="flex flex-col gap-1">
                <Label className="text-xs text-slate-400">Confirm New Password *</Label>
                <Input
                  type="password"
                  required
                  minLength={8}
                  placeholder="Repeat new password"
                  value={passForm.confirmPassword}
                  onChange={(e) => setPassForm({ ...passForm, confirmPassword: e.target.value })}
                />
              </div>
            </div>
            {passError && <p className="text-xs text-red-400 font-medium">{passError}</p>}
            <div className="mt-1 flex justify-end">
              <Button type="submit" size="sm" disabled={changingPass} className="bg-sky-600 hover:bg-sky-500 text-white font-medium">
                <Key className="mr-1.5 h-3.5 w-3.5" />
                {changingPass ? "Updating Password…" : "Update Password"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* Central Alert Thresholds & Backup Config */}
      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Alerts & site config backup</CardTitle>
          <p className="text-xs text-slate-500">
            Stored centrally and picked up by the alert engine within seconds — no restart
            needed.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!form && !loadError ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))
          ) : form ? (
            FIELDS.map(({ key, label, hint, min, max }) => (
              <div key={key} className="flex flex-col gap-1.5">
                {key === "config_sync_interval_seconds" && (
                  <div className="mt-2 border-t border-slate-800/70 pt-4">
                    <Label className="text-xs font-semibold uppercase tracking-wide text-emerald-400/90">
                      Site MongoDB config backup
                    </Label>
                  </div>
                )}
                <Label htmlFor={key} className="text-xs text-slate-400">
                  {label}
                </Label>
                <Input
                  id={key}
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  disabled={!isAdmin}
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
                <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
              </div>
            ))
          ) : null}

          {form && (
            <label className="flex cursor-pointer select-none items-center gap-3 self-start">
              <input
                type="checkbox"
                disabled={!isAdmin}
                checked={form.config_sync_enabled}
                onChange={(e) =>
                  setForm({ ...form, config_sync_enabled: e.target.checked })
                }
                className="h-4 w-4 accent-emerald-500 disabled:opacity-50"
              />
              <span className="text-sm text-slate-300">Site config backup enabled</span>
            </label>
          )}

          {isAdmin && (
            <Button onClick={save} disabled={saving || !form} className="mt-2 self-start">
              <Save className="mr-2 h-4 w-4" />
              {saving ? "Saving…" : "Save changes"}
            </Button>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
