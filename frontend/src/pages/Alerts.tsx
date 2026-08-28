import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { Alert, Server, Site } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatTime } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";

export default function Alerts() {
  const { isAdmin } = useAuth();
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [serverMap, setServerMap] = useState<Record<string, Server>>({});
  const [siteMap, setSiteMap] = useState<Record<string, Site>>({});
  const [filter, setFilter] = useState<"active" | "resolved" | "all">("active");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [a, s, st] = await Promise.all([
        apiFetch<Alert[]>(`/alerts${filter !== "all" ? `?status=${filter}` : ""}`),
        apiFetch<Server[]>("/servers"),
        apiFetch<Site[]>("/sites"),
      ]);
      setAlerts(a);
      setServerMap(Object.fromEntries(s.map((x) => [x.id, x])));
      setSiteMap(Object.fromEntries(st.map((x) => [x.id, x])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const socket = getSocket();
    socket.on("alert_opened", load);
    socket.on("alert_resolved", load);
    return () => {
      socket.off("alert_opened", load);
      socket.off("alert_resolved", load);
    };
  }, [filter]);

  async function resolve(id: string) {
    await apiFetch(`/alerts/${id}/resolve`, { method: "POST" });
    await load();
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alert logs</h1>
          <p className="text-sm text-slate-400">Full history of alerts and warnings</p>
        </div>
        <div className="flex gap-1">
          {(["active", "resolved", "all"] as const).map((f) => (
            <Button key={f} variant={filter === f ? "default" : "ghost"} size="sm" onClick={() => setFilter(f)}>
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">
            {loading ? "Loading…" : `${alerts.length} alerts`}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Severity</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 6 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-[160px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <>
                  {alerts.length === 0 && (
                    <TableRow><TableCell colSpan={6} className="text-slate-500">No alerts.</TableCell></TableRow>
                  )}
                  {alerts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><SeverityBadge severity={a.severity} /></TableCell>
                  <TableCell>
                    {(() => {
                      const srv = serverMap[a.server_id];
                      const site = srv ? siteMap[srv.site_id] : undefined;
                      return (
                        <div className="flex flex-col leading-tight">
                          <span className="font-medium">
                            {srv ? srv.name : a.server_id.slice(0, 8)}
                          </span>
                          <span className="text-xs text-slate-500">
                            {[srv?.hostname, site?.client, site?.location].filter(Boolean).join(" · ") || "—"}
                          </span>
                        </div>
                      );
                    })()}
                  </TableCell>
                  <TableCell>{a.message}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "red" : "green"}>{a.status}</Badge>
                  </TableCell>
                  <TableCell>{formatTime(a.created_at)}</TableCell>
                  <TableCell>
                    {isAdmin && a.status === "active" && (
                      <Button variant="outline" size="sm" onClick={() => resolve(a.id)}>Resolve</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
                </>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}