import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { Alert, Server } from "@/lib/types";
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

export default function Alerts() {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [servers, setServers] = useState<Record<string, string>>({});
  const [filter, setFilter] = useState<"active" | "resolved" | "all">("active");
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const [a, s] = await Promise.all([
        apiFetch<Alert[]>(`/alerts${filter !== "all" ? `?status=${filter}` : ""}`),
        apiFetch<Server[]>("/servers"),
      ]);
      setAlerts(a);
      setServers(Object.fromEntries(s.map((x) => [x.id, `${x.name} (${x.hostname})`])));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
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
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Alerts</h1>
          <p className="text-sm text-slate-400">Threshold violations and incidents</p>
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
        <CardHeader><CardTitle className="text-sm">{alerts.length} alerts</CardTitle></CardHeader>
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
              {alerts.length === 0 && (
                <TableRow><TableCell colSpan={6} className="text-slate-500">No alerts.</TableCell></TableRow>
              )}
              {alerts.map((a) => (
                <TableRow key={a.id}>
                  <TableCell><SeverityBadge severity={a.severity} /></TableCell>
                  <TableCell>{servers[a.server_id] ?? a.server_id}</TableCell>
                  <TableCell>{a.message}</TableCell>
                  <TableCell>
                    <Badge variant={a.status === "active" ? "red" : "green"}>{a.status}</Badge>
                  </TableCell>
                  <TableCell>{formatTime(a.created_at)}</TableCell>
                  <TableCell>
                    {a.status === "active" && (
                      <Button variant="outline" size="sm" onClick={() => resolve(a.id)}>Resolve</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}