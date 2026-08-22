import { useEffect, useState } from "react";
import { AlertTriangle, Info, OctagonAlert, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { cn } from "@/lib/utils";
import type { Server, Site } from "@/lib/types";

export type ToastSeverity = "info" | "warning" | "critical";

export interface ToastInput {
  severity?: ToastSeverity;
  title: string;
  message?: string;
}

interface Toast extends ToastInput {
  id: number;
}

// Module-level push so any module can raise toasts without prop drilling.
let push: ((t: ToastInput) => void) | null = null;

export function showToast(t: ToastInput): void {
  push?.(t);
}

const STYLES: Record<ToastSeverity, { wrap: string; icon: typeof Info }> = {
  warning: { wrap: "border-amber-500/40 text-amber-200", icon: AlertTriangle },
  critical: { wrap: "border-red-500/50 text-red-200", icon: OctagonAlert },
  info: { wrap: "border-sky-500/40 text-sky-200", icon: Info },
};

const ICON_TINT: Record<ToastSeverity, string> = {
  warning: "text-amber-400",
  critical: "text-red-400",
  info: "text-sky-400",
};

const TITLES: Record<string, string> = {
  ram_high: "High memory usage",
  cpu_high: "High CPU usage",
  disk_high: "Disk almost full",
  service_stopped: "Service stopped",
  server_offline: "Server offline",
};

const AUTO_DISMISS_MS = 6000;
const MAX_VISIBLE = 4;

/** Global toast stack; also raises a toast for every alert the backend opens. */
export function ToastHost() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => {
    const dismiss = (id: number) =>
      setToasts((prev) => prev.filter((t) => t.id !== id));

    push = (t) => {
      const id = Date.now() + Math.random();
      setToasts((prev) => [...prev.slice(-(MAX_VISIBLE - 1)), { ...t, id }]);
      window.setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
    };

    const socket = getSocket();

    // Lookup maps so toasts can show "client · equipment · location".
    const servers = new Map<string, Server>();
    const sites = new Map<string, Site>();
    Promise.all([apiFetch<Server[]>("/servers"), apiFetch<Site[]>("/sites")])
      .then(([sv, st]) => {
        sv.forEach((s) => servers.set(s.id, s));
        st.forEach((x) => sites.set(x.id, x));
      })
      .catch(() => {}); // fall back to hostname-only toasts if lookup fails

    const describe = (serverId?: string): string | undefined => {
      const srv = serverId ? servers.get(serverId) : undefined;
      if (!srv) return undefined;
      const site = srv.site_id ? sites.get(srv.site_id) : undefined;
      return [srv.name, site?.client, site?.location].filter(Boolean).join(" · ");
    };

    const onAlert = (d: {
      type?: string;
      severity?: string;
      message?: string;
      hostname?: string;
      server_id?: string;
    }) => {
      showToast({
        severity:
          d.severity === "critical"
            ? "critical"
            : d.severity === "warning"
              ? "warning"
              : "info",
        title: TITLES[d.type ?? ""] ?? "Alert",
        message: [describe(d.server_id), d.message].filter(Boolean).join(" — "),
      });
    };
    socket.on("alert_opened", onAlert);

    return () => {
      socket.off("alert_opened", onAlert);
      push = null;
    };
  }, []);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed right-4 top-20 z-[100] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => {
        const style = STYLES[t.severity ?? "info"];
        const Icon = style.icon;
        return (
          <button
            key={t.id}
            onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
            className={cn(
              "animate-toast-in flex items-start gap-3 rounded-xl border border-slate-700/80 bg-slate-900/95 p-3 text-left shadow-2xl shadow-black/50 backdrop-blur-md transition-colors hover:border-slate-600",
              style.wrap,
              "cursor-pointer"
            )}
          >
            <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", ICON_TINT[t.severity ?? "info"])} />
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t.title}</span>
              {t.message && (
                <span className="mt-0.5 block break-words text-xs text-slate-400">{t.message}</span>
              )}
            </span>
            <X className="mt-0.5 h-3.5 w-3.5 shrink-0 opacity-50" />
          </button>
        );
      })}
    </div>
  );
}
