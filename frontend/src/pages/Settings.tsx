import { useEffect, useState } from "react";
import { Key, Lock, MessageCircle, Save, Trash2, UserPlus, Users, KeyRound } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { showToast } from "@/components/ToastHost";
import type { AlertConfig, Role, User } from "@/lib/types";
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
    key: "config_sync_interval_seconds",
    label: "Site config backup interval (seconds)",
    hint: "How often site agents upload MongoDB config snapshots to the hub. Agents pick up changes on their next heartbeat.",
    min: 60,
  },
];

interface WhatsAppConfig {
  whatsapp_enabled: boolean;
  whatsapp_base_url: string;
  whatsapp_instance: string;
  whatsapp_api_key_set: boolean;
  whatsapp_recipients: string;
}

export default function Settings() {
  const { user: currentUser, isAdmin } = useAuth();
  const [form, setForm] = useState<AlertConfig | null>(null);
  const [wa, setWa] = useState<WhatsAppConfig | null>(null);
  const [waKey, setWaKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // User Management State
  const [users, setUsers] = useState<User[]>([]);
  const [usersLoading, setUsersLoading] = useState(false);
  const [showAddUser, setShowAddUser] = useState(false);
  const [newUser, setNewUser] = useState({
    email: "",
    password: "",
    name: "",
    role: "viewer" as Role,
  });
  const [creatingUser, setCreatingUser] = useState(false);

  // Personal Password Change State
  const [passForm, setPassForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });
  const [changingPass, setChangingPass] = useState(false);
  const [passError, setPassError] = useState<string | null>(null);

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

  async function handleAdminResetPassword(userId: string, email: string) {
    const newPass = prompt(`Enter new password for user ${email} (minimum 8 characters):`);
    if (!newPass) return;
    if (newPass.length < 8) {
      showToast({
        severity: "critical",
        title: "Password Too Short",
        message: "Password must be at least 8 characters long.",
      });
      return;
    }
    try {
      await apiFetch(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ password: newPass }),
      });
      showToast({
        severity: "info",
        title: "Password Reset",
        message: `Password updated for ${email}.`,
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Password Reset Failed",
        message: err instanceof Error ? err.message : undefined,
      });
    }
  }

  useEffect(() => {
    Promise.all([
      apiFetch<AlertConfig>("/settings"),
      apiFetch<WhatsAppConfig>("/settings/whatsapp").catch(() => null),
    ])
      .then(([cfg, waCfg]) => {
        setForm(cfg);
        if (waCfg) setWa(waCfg);
      })
      .catch((err) =>
        setLoadError(err instanceof Error ? err.message : "Failed to load settings")
      );

    if (isAdmin) {
      fetchUsers();
    }
  }, [isAdmin]);

  function fetchUsers() {
    setUsersLoading(true);
    apiFetch<User[]>("/users")
      .then(setUsers)
      .catch((err) =>
        showToast({
          severity: "critical",
          title: "Failed to load users",
          message: err instanceof Error ? err.message : undefined,
        })
      )
      .finally(() => setUsersLoading(false));
  }

  async function handleCreateUser(e: React.FormEvent) {
    e.preventDefault();
    if (!newUser.email || !newUser.password) return;
    setCreatingUser(true);
    try {
      const created = await apiFetch<User>("/users", {
        method: "POST",
        body: JSON.stringify(newUser),
      });
      setUsers((prev) => [...prev, created]);
      setShowAddUser(false);
      setNewUser({ email: "", password: "", name: "", role: "viewer" });
      showToast({
        severity: "info",
        title: "User created",
        message: `Account ${created.email} (${created.role}) created successfully.`,
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Create user failed",
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setCreatingUser(false);
    }
  }

  async function handleRoleChange(userId: string, newRole: Role) {
    try {
      const updated = await apiFetch<User>(`/users/${userId}`, {
        method: "PATCH",
        body: JSON.stringify({ role: newRole }),
      });
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
      showToast({
        severity: "info",
        title: "Role updated",
        message: `Role changed to ${newRole}.`,
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Role update failed",
        message: err instanceof Error ? err.message : undefined,
      });
    }
  }

  async function handleDeleteUser(userId: string, email: string) {
    if (!confirm(`Are you sure you want to delete user ${email}?`)) return;
    try {
      await apiFetch(`/users/${userId}`, { method: "DELETE" });
      setUsers((prev) => prev.filter((u) => u.id !== userId));
      showToast({
        severity: "info",
        title: "User deleted",
        message: `Account ${email} removed.`,
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Delete user failed",
        message: err instanceof Error ? err.message : undefined,
      });
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

  async function saveWhatsApp(): Promise<boolean> {
    if (!wa) return false;
    const payload: Record<string, unknown> = { ...wa };
    delete payload.whatsapp_api_key_set;
    if (waKey.trim()) payload.whatsapp_api_key = waKey.trim(); // empty = keep existing
    try {
      const saved = await apiFetch<WhatsAppConfig>("/settings/whatsapp", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setWa(saved);
      setWaKey("");
      return true;
    } catch (err) {
      showToast({
        severity: "critical",
        title: "WhatsApp save failed",
        message: err instanceof Error ? err.message : undefined,
      });
      return false;
    }
  }

  async function testWhatsApp() {
    if (!(await saveWhatsApp())) return;
    setTesting(true);
    try {
      const results = await apiFetch<{ number: string; ok: boolean; detail: string }[]>(
        "/settings/whatsapp/test",
        { method: "POST" }
      );
      if (results.every((r) => r.ok)) {
        showToast({ severity: "info", title: "Test message sent", message: "Check WhatsApp." });
      } else {
        showToast({
          severity: "critical",
          title: "Test failed",
          message: results.map((r) => `${r.number}: ${r.detail}`).join(" | "),
        });
      }
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Test failed",
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
        <p className="text-sm text-slate-400">Platform configurations and user roles</p>
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

      {/* User Management Section (Admin Only) */}
      {isAdmin && (
        <Card className="max-w-2xl border-emerald-500/30 bg-slate-900/80">
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-100">
                <Users className="h-4 w-4 text-emerald-400" />
                User Management & Roles
              </CardTitle>
              <p className="text-xs text-slate-400">
                Add dashboard users and assign permissions (<code className="text-emerald-400">admin</code> or <code className="text-slate-400">viewer</code>).
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setShowAddUser(!showAddUser)}
              className="bg-emerald-600 text-white hover:bg-emerald-500"
            >
              <UserPlus className="mr-1.5 h-3.5 w-3.5" />
              Add User
            </Button>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {showAddUser && (
              <form
                onSubmit={handleCreateUser}
                className="flex flex-col gap-3 rounded-xl border border-slate-700/80 bg-slate-950/60 p-4"
              >
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  New User Registration
                </h4>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-slate-400">Email Address *</Label>
                    <Input
                      type="email"
                      required
                      placeholder="user@company.com"
                      value={newUser.email}
                      onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-slate-400">Password *</Label>
                    <Input
                      type="password"
                      required
                      minLength={8}
                      placeholder="At least 8 characters"
                      value={newUser.password}
                      onChange={(e) => setNewUser({ ...newUser, password: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-slate-400">Full Name</Label>
                    <Input
                      placeholder="Jane Doe"
                      value={newUser.name}
                      onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <Label className="text-xs text-slate-400">Role *</Label>
                    <select
                      value={newUser.role}
                      onChange={(e) => setNewUser({ ...newUser, role: e.target.value as Role })}
                      className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-emerald-500"
                    >
                      <option value="viewer">Viewer (Read-only)</option>
                      <option value="admin">Admin (Full Control)</option>
                    </select>
                  </div>
                </div>
                <div className="mt-1 flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setShowAddUser(false)}
                  >
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={creatingUser}>
                    {creatingUser ? "Saving…" : "Create User"}
                  </Button>
                </div>
              </form>
            )}

            {usersLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400">
                      <th className="pb-2 font-medium">User</th>
                      <th className="pb-2 font-medium">Role</th>
                      <th className="pb-2 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60">
                    {users.map((u) => {
                      const isSelf = currentUser?.id === u.id;
                      const initials = (u.name || u.email).slice(0, 2).toUpperCase();
                      return (
                        <tr key={u.id} className="group transition-colors hover:bg-slate-800/40">
                          <td className="py-2.5">
                            <div className="flex items-center gap-2.5">
                              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-emerald-500/30 bg-gradient-to-br from-emerald-500/20 to-sky-500/20 text-[10px] font-bold text-emerald-300 shadow-inner">
                                {initials}
                              </div>
                              <div>
                                <div className="font-medium text-slate-200">{u.email}</div>
                                {u.name && <div className="text-[11px] text-slate-400">{u.name}</div>}
                              </div>
                            </div>
                          </td>
                          <td className="py-2.5">
                            <select
                              value={u.role}
                              disabled={isSelf}
                              onChange={(e) => handleRoleChange(u.id, e.target.value as Role)}
                              className="rounded border border-slate-700 bg-slate-900 px-2 py-0.5 text-xs text-slate-300 outline-none focus:border-emerald-500 disabled:opacity-50"
                            >
                              <option value="viewer">Viewer</option>
                              <option value="admin">Admin</option>
                            </select>
                          </td>
                          <td className="py-2.5 text-right flex items-center justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              title={`Reset password for ${u.email}`}
                              onClick={() => handleAdminResetPassword(u.id, u.email)}
                              className="h-7 w-7 text-slate-500 hover:text-sky-400"
                            >
                              <KeyRound className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              disabled={isSelf}
                              title={isSelf ? "Cannot delete your own account" : "Delete user"}
                              onClick={() => handleDeleteUser(u.id, u.email)}
                              className="h-7 w-7 text-slate-500 hover:text-red-400 disabled:opacity-30"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

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

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            WhatsApp notifications
          </CardTitle>
          <p className="text-xs text-slate-500">
            Sends a WhatsApp message to each recipient whenever a new alert opens. Uses a
            self-hosted Evolution API gateway (enable with
            <code className="mx-1 rounded bg-slate-800 px-1 py-0.5 font-mono text-[10px]">
              --profile whatsapp
            </code>
            and pair it once by scanning the QR code).
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!wa && !loadError ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-40" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))
          ) : wa ? (
            <>
              <label className="flex cursor-pointer select-none items-center gap-3">
                <input
                  type="checkbox"
                  disabled={!isAdmin}
                  checked={wa.whatsapp_enabled}
                  onChange={(e) => setWa({ ...wa, whatsapp_enabled: e.target.checked })}
                  className="h-4 w-4 accent-emerald-500 disabled:opacity-50"
                />
                <span className="text-sm text-slate-300">Enabled</span>
              </label>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wa-url" className="text-xs text-slate-400">
                    Gateway URL
                  </Label>
                  <Input
                    id="wa-url"
                    disabled={!isAdmin}
                    value={wa.whatsapp_base_url}
                    onChange={(e) => setWa({ ...wa, whatsapp_base_url: e.target.value })}
                    placeholder="http://evolution-api:8080"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="wa-instance" className="text-xs text-slate-400">
                    Instance name
                  </Label>
                  <Input
                    id="wa-instance"
                    disabled={!isAdmin}
                    value={wa.whatsapp_instance}
                    onChange={(e) => setWa({ ...wa, whatsapp_instance: e.target.value })}
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wa-key" className="text-xs text-slate-400">
                  Gateway API key{" "}
                  {wa.whatsapp_api_key_set && (
                    <span className="ml-1 text-emerald-400">(saved)</span>
                  )}
                </Label>
                <Input
                  id="wa-key"
                  type="password"
                  disabled={!isAdmin}
                  value={waKey}
                  onChange={(e) => setWaKey(e.target.value)}
                  placeholder={wa.whatsapp_api_key_set ? "unchanged — leave blank to keep" : "apikey"}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wa-recipients" className="text-xs text-slate-400">
                  Recipients
                </Label>
                <Input
                  id="wa-recipients"
                  disabled={!isAdmin}
                  value={wa.whatsapp_recipients}
                  onChange={(e) => setWa({ ...wa, whatsapp_recipients: e.target.value })}
                  placeholder="919876543210, 14155551234"
                />
                <p className="text-[11px] text-slate-500">
                  Comma-separated numbers with country code, digits only. They must have your
                  sender number saved as a contact.
                </p>
              </div>

              {isAdmin && (
                <div className="mt-2 flex gap-2">
                  <Button variant="outline" disabled={testing} onClick={testWhatsApp}>
                    <MessageCircle className="mr-2 h-4 w-4" />
                    {testing ? "Sending…" : "Save & send test"}
                  </Button>
                  <Button variant="secondary" disabled={saving || !form} onClick={saveWhatsApp}>
                    {saving ? "Saving…" : "Save"}
                  </Button>
                </div>
              )}
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
