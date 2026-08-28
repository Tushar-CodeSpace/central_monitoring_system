import { useEffect, useState } from "react";
import { MessageCircle, Save } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { showToast } from "@/components/ToastHost";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";

interface WhatsAppConfig {
  whatsapp_enabled: boolean;
  whatsapp_base_url: string;
  whatsapp_instance: string;
  whatsapp_api_key_set: boolean;
  whatsapp_recipients: string;
}

export default function WhatsAppPage() {
  const { isAdmin } = useAuth();
  const [wa, setWa] = useState<WhatsAppConfig | null>(null);
  const [waKey, setWaKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (isAdmin) {
      apiFetch<WhatsAppConfig>("/settings/whatsapp")
        .then(setWa)
        .catch((err) =>
          setLoadError(err instanceof Error ? err.message : "Failed to load WhatsApp config")
        );
    }
  }, [isAdmin]);

  async function saveWhatsApp(): Promise<boolean> {
    if (!wa) return false;
    setSaving(true);
    const payload: Record<string, unknown> = { ...wa };
    delete payload.whatsapp_api_key_set;
    if (waKey.trim()) payload.whatsapp_api_key = waKey.trim();
    try {
      const saved = await apiFetch<WhatsAppConfig>("/settings/whatsapp", {
        method: "PATCH",
        body: JSON.stringify(payload),
      });
      setWa(saved);
      setWaKey("");
      showToast({
        severity: "info",
        title: "WhatsApp settings saved",
        message: "Alert notification target updated.",
      });
      return true;
    } catch (err) {
      showToast({
        severity: "critical",
        title: "WhatsApp save failed",
        message: err instanceof Error ? err.message : undefined,
      });
      return false;
    } finally {
      setSaving(false);
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

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-xl font-bold text-red-400">Access Restricted</h2>
        <p className="mt-1 text-sm text-slate-400">WhatsApp Notification Settings are restricted to Admin accounts.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">WhatsApp Notifications</h1>
        <p className="text-sm text-slate-400">Configure Evolution API WhatsApp Gateway for real-time incident alerts</p>
      </div>

      <Card className="max-w-2xl border-emerald-500/30 bg-slate-900/80">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-100">
            <MessageCircle className="h-4 w-4 text-emerald-400" />
            Evolution API Gateway Setup
          </CardTitle>
          <p className="text-xs text-slate-400">
            Sends an instant WhatsApp notification to designated recipients whenever a server alert triggers.
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {loadError && <p className="text-sm text-red-400">{loadError}</p>}
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
                <span className="text-sm font-medium text-slate-200">Enable WhatsApp Dispatcher</span>
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
                    Instance Name
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
                  Gateway API Key{" "}
                  {wa.whatsapp_api_key_set && (
                    <span className="ml-1 text-emerald-400">(Key is saved)</span>
                  )}
                </Label>
                <Input
                  id="wa-key"
                  type="password"
                  value={waKey}
                  onChange={(e) => setWaKey(e.target.value)}
                  placeholder={wa.whatsapp_api_key_set ? "Unchanged — leave blank to keep" : "API key"}
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="wa-recipients" className="text-xs text-slate-400">
                  Recipient Phone Numbers
                </Label>
                <Input
                  id="wa-recipients"
                  value={wa.whatsapp_recipients}
                  onChange={(e) => setWa({ ...wa, whatsapp_recipients: e.target.value })}
                  placeholder="919876543210, 14155551234"
                />
                <p className="text-[11px] text-slate-500">
                  Comma-separated phone numbers with country code (digits only, e.g. 919876543210).
                </p>
              </div>

              <div className="mt-2 flex gap-2">
                <Button variant="outline" disabled={testing} onClick={testWhatsApp} className="border-slate-700">
                  <MessageCircle className="mr-2 h-4 w-4 text-emerald-400" />
                  {testing ? "Sending Test…" : "Save & Send Test Message"}
                </Button>
                <Button disabled={saving} onClick={saveWhatsApp} className="bg-emerald-600 hover:bg-emerald-500 text-white">
                  <Save className="mr-2 h-4 w-4" />
                  {saving ? "Saving…" : "Save Settings"}
                </Button>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
