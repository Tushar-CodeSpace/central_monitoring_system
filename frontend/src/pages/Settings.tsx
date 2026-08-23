import { useEffect, useState } from "react";
import { MessageCircle, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { showToast } from "@/components/ToastHost";
import type { AlertConfig } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

const FIELDS: {
  key: keyof AlertConfig;
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
];

interface WhatsAppConfig {
  whatsapp_enabled: boolean;
  whatsapp_base_url: string;
  whatsapp_instance: string;
  whatsapp_api_key_set: boolean;
  whatsapp_recipients: string;
}

export default function Settings() {
  const [form, setForm] = useState<AlertConfig | null>(null);
  const [wa, setWa] = useState<WhatsAppConfig | null>(null);
  const [waKey, setWaKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

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
  }, []);

  function update(key: keyof AlertConfig, raw: string) {
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
        <p className="text-sm text-slate-400">Alert thresholds — applied platform-wide</p>
      </div>

      {loadError && <p className="text-sm text-red-400">{loadError}</p>}

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle className="text-sm">Alert thresholds</CardTitle>
          <p className="text-xs text-slate-500">
            Stored centrally and picked up by the alert engine within seconds — no restart
            needed.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {!form && !loadError ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-9 w-full" />
              </div>
            ))
          ) : form ? (
            FIELDS.map(({ key, label, hint, min, max }) => (
              <div key={key} className="flex flex-col gap-1.5">
                <Label htmlFor={key} className="text-xs text-slate-400">
                  {label}
                </Label>
                <Input
                  id={key}
                  type="number"
                  min={min}
                  max={max}
                  step={1}
                  value={form[key]}
                  onChange={(e) => update(key, e.target.value)}
                />
                <p className="text-[11px] leading-relaxed text-slate-500">{hint}</p>
              </div>
            ))
          ) : null}

          <Button onClick={save} disabled={saving || !form} className="mt-2 self-start">
            <Save className="mr-2 h-4 w-4" />
            {saving ? "Saving…" : "Save changes"}
          </Button>
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
                  checked={wa.whatsapp_enabled}
                  onChange={(e) => setWa({ ...wa, whatsapp_enabled: e.target.checked })}
                  className="h-4 w-4 accent-emerald-500"
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
                  value={wa.whatsapp_recipients}
                  onChange={(e) => setWa({ ...wa, whatsapp_recipients: e.target.value })}
                  placeholder="919876543210, 14155551234"
                />
                <p className="text-[11px] text-slate-500">
                  Comma-separated numbers with country code, digits only. They must have your
                  sender number saved as a contact.
                </p>
              </div>

              <div className="mt-2 flex gap-2">
                <Button variant="outline" disabled={testing} onClick={testWhatsApp}>
                  <MessageCircle className="mr-2 h-4 w-4" />
                  {testing ? "Sending…" : "Save & send test"}
                </Button>
                <Button variant="secondary" disabled={saving || !form} onClick={saveWhatsApp}>
                  {saving ? "Saving…" : "Save"}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
