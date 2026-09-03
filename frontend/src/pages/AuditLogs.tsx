import { useEffect, useState } from "react";
import { History, LogIn, LogOut, RefreshCw, Search, Wifi, WifiOff } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { showToast } from "@/components/ToastHost";
import type { AuditLog } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { cn, formatTime } from "@/lib/utils";

export default function AuditLogsPage() {
  const { isAdmin } = useAuth();
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditSearch, setAuditSearch] = useState("");
  const [auditActionFilter, setAuditActionFilter] = useState<"all" | "login" | "logout" | "connectivity">("all");

  function fetchAuditLogs() {
    setAuditLoading(true);
    apiFetch<AuditLog[]>("/users/audit-logs")
      .then(setAuditLogs)
      .catch((err) =>
        showToast({
          severity: "critical",
          title: "Failed to load audit logs",
          message: err instanceof Error ? err.message : undefined,
        })
      )
      .finally(() => setAuditLoading(false));
  }

  useEffect(() => {
    if (isAdmin) {
      fetchAuditLogs();
    }
  }, [isAdmin]);

  const filteredAuditLogs = auditLogs.filter((log) => {
    const isConnectivity = log.action === "connectivity_lost" || log.action === "connectivity_restored";
    const matchesAction =
      auditActionFilter === "all" ||
      (auditActionFilter === "connectivity" ? isConnectivity : log.action === auditActionFilter);
    const matchesSearch =
      !auditSearch.trim() ||
      log.email.toLowerCase().includes(auditSearch.toLowerCase()) ||
      (log.details?.target ?? "").toLowerCase().includes(auditSearch.toLowerCase());
    return matchesAction && matchesSearch;
  });

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-center">
        <h2 className="text-xl font-bold text-red-400">Access Restricted</h2>
        <p className="mt-1 text-sm text-slate-400">Audit logs are restricted to Admin accounts.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Audit Logs</h1>
        <p className="text-sm text-slate-400">Security audit history tracking user logins/logouts and device connectivity changes</p>
      </div>

      <Card className="max-w-4xl border-indigo-500/30 bg-slate-900/80">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <History className="h-4 w-4 text-indigo-400" />
              Activity History ({filteredAuditLogs.length})
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Security and system events across the platform (logins, logouts, connectivity changes).
            </p>
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={fetchAuditLogs}
            disabled={auditLoading}
            className="border-slate-700 bg-slate-950 text-slate-300 hover:bg-slate-800 text-xs h-8"
          >
            <RefreshCw className={cn("mr-1.5 h-3.5 w-3.5", auditLoading && "animate-spin")} />
            Refresh Logs
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-3">
            <div className="flex rounded-lg border border-slate-800 bg-slate-950 p-1">
              {(["all", "login", "logout", "connectivity"] as const).map((a) => (
                <button
                  key={a}
                  onClick={() => setAuditActionFilter(a)}
                  className={cn(
                    "rounded-md px-2.5 py-0.5 text-xs font-medium uppercase transition-all",
                    auditActionFilter === a
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  )}
                >
                  {a}
                </button>
              ))}
            </div>

            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Filter email or device target..."
                value={auditSearch}
                onChange={(e) => setAuditSearch(e.target.value)}
                className="h-7 w-56 rounded-lg border border-slate-700/60 bg-slate-950 pl-8 pr-3 text-xs text-slate-200 placeholder-slate-500 outline-none focus:border-indigo-500/60"
              />
            </div>
          </div>

          {auditLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : filteredAuditLogs.length === 0 ? (
            <div className="py-8 text-center text-xs text-slate-500">
              No activity recorded yet.
            </div>
          ) : (
            <div className="max-h-[32rem] overflow-y-auto pr-1">
              <table className="w-full text-left text-xs">
                <thead className="sticky top-0 bg-slate-900 border-b border-slate-800 text-slate-400">
                  <tr>
                    <th className="pb-2 font-medium">User Account</th>
                    <th className="pb-2 font-medium">Event Action</th>
                    <th className="pb-2 font-medium">Timestamp</th>
                    <th className="pb-2 text-right font-medium">Client IP Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-mono">
                  {filteredAuditLogs.map((log) => (
                    <tr key={log.id} className="hover:bg-slate-800/40 transition-colors">
                      <td className="py-2.5 font-sans font-medium text-slate-200">
                        {log.email}
                        {log.action.startsWith("connectivity") && log.details?.target && (
                          <span className="ml-2 rounded bg-slate-800 px-1.5 py-0.5 font-mono text-[10px] font-normal text-slate-400">
                            {log.details.target}{log.details.ip ? ` · ${log.details.ip}` : ""}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5">
                        {log.action === "login" ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase">
                            <LogIn className="h-3 w-3" /> Login
                          </span>
                        ) : log.action === "connectivity_lost" ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-red-500/30 bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 uppercase" title={`${log.details?.target ?? ""} ${log.details?.ip ?? ""}`}>
                            <WifiOff className="h-3 w-3" /> Connectivity lost
                          </span>
                        ) : log.action === "connectivity_restored" ? (
                          <span className="inline-flex items-center gap-1 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-400 uppercase" title={`${log.details?.target ?? ""} ${log.details?.ip ?? ""}${log.details?.latency_ms != null ? ` · ${log.details.latency_ms} ms` : ""}`}>
                            <Wifi className="h-3 w-3" /> Reconnected
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-bold text-amber-400 uppercase">
                            <LogOut className="h-3 w-3" /> Logout
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 text-slate-400 text-[11px]">
                        {formatTime(log.timestamp)}
                      </td>
                      <td
                        className="py-2.5 text-right text-slate-400 text-[11px] font-mono"
                        title={log.user_agent}
                      >
                        {log.ip_address || "127.0.0.1"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
