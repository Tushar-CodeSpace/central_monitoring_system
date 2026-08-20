import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Server as ServerIcon,
  Wifi,
  WifiOff,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { LatestMetric, Server, Site } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn, formatTime, formatUptime } from "@/lib/utils";

interface DashboardServer extends Server {
  latest: LatestMetric | null;
}

interface Totals {
  servers: number;
  sites: number;
  online: number;
  warning: number;
  offline: number;
  unknown: number;
  active_alerts: number;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const siteName = (siteId: string) => sites.find((s) => s.id === siteId)?.client ?? siteId.slice(0, 8);
  const siteLocation = (siteId: string) => sites.find((s) => s.id === siteId)?.location ?? "—";

  async function load() {
    try {
      const data = await apiFetch<{
        sites: Site[];
        servers: DashboardServer[];
        totals: Totals;
      }>("/dashboard");
      setSites(data.sites);
      setServers(data.servers);
      setTotals(data.totals);
      setLastUpdated(new Date());
      return data.servers;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
      return [];
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 30000); // fallback; socket keeps it live

    const socket = getSocket();
    const joined = new Set<string>();

    const onStatus = (d: { server_id: string; status: Server["status"] }) => {
      setServers((prev) =>
        prev.map((s) => (s.id === d.server_id ? { ...s, status: d.status } : s))
      );
    };
    const onMetric = (m: LatestMetric & { server_id: string }) => {
      const { server_id, ...rest } = m;
      setServers((prev) =>
        prev.map((s) => (s.id === server_id ? { ...s, latest: rest } : s))
      );
    };
    const onAlert = () => load();

    socket.on("server_status", onStatus);
    socket.on("metric", onMetric);
    socket.on("alert_opened", onAlert);
    socket.on("alert_resolved", onAlert);

    // join every server's room so metric events update rows live
    const joinAll = async () => {
      const list = await load().catch(() => [] as DashboardServer[]);
      for (const s of list) {
        if (!joined.has(s.id)) {
          socket.emit("join", s.id);
          joined.add(s.id);
        }
      }
    };
    joinAll();
    const joinTimer = setInterval(joinAll, 60000);

    return () => {
      clearInterval(t);
      clearInterval(joinTimer);
      socket.off("server_status", onStatus);
      socket.off("metric", onMetric);
      socket.off("alert_opened", onAlert);
      socket.off("alert_resolved", onAlert);
      for (const id of joined) socket.emit("leave", id);
    };
  }, []);

  const cards = [
    { label: "Servers", value: totals?.servers ?? 0, icon: ServerIcon, accent: "text-emerald-400", chip: "bg-emerald-500/10 border-emerald-500/30", ring: "hover:border-emerald-500/40" },
    { label: "Online", value: totals?.online ?? 0, icon: Wifi, accent: "text-emerald-400", chip: "bg-emerald-500/10 border-emerald-500/30", ring: "hover:border-emerald-500/40" },
    { label: "Warning", value: totals?.warning ?? 0, icon: Zap, accent: "text-amber-400", chip: "bg-amber-500/10 border-amber-500/30", ring: "hover:border-amber-500/40" },
    { label: "Offline", value: totals?.offline ?? 0, icon: WifiOff, accent: "text-red-400", chip: "bg-red-500/10 border-red-500/30", ring: "hover:border-red-500/40" },
    { label: "Active alerts", value: totals?.active_alerts ?? 0, icon: AlertTriangle, accent: "text-sky-400", chip: "bg-sky-500/10 border-sky-500/30", ring: "hover:border-sky-500/40" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-slate-400">All monitored servers at a glance</p>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-400">
          <span className="relative flex h-2 w-2">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
          </span>
          Live · updated {lastUpdated ? lastUpdated.toLocaleTimeString() : "…"}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {cards.map(({ label, value, icon: Icon, accent, chip, ring }) => (
          <Card key={label} className={cn("transition-colors", ring)}>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle className="text-sm text-slate-400">{label}</CardTitle>
              <div className={cn("rounded-lg border p-1.5", chip)}>
                <Icon className={cn("h-4 w-4", accent)} />
              </div>
            </CardHeader>
            <CardContent className={cn("text-3xl font-bold", accent)}>{value}</CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">All agents</CardTitle>
          <span className="text-xs text-slate-500">click a row for full details</span>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Client</TableHead>
                <TableHead>Location</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Server</TableHead>
                <TableHead>Hostname</TableHead>
                <TableHead>IP</TableHead>
                <TableHead className="text-right">CPU</TableHead>
                <TableHead className="text-right">Memory</TableHead>
                <TableHead className="text-right">Disk</TableHead>
                <TableHead className="text-right">Uptime</TableHead>
                <TableHead>Last seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {servers.length === 0 && (
                <TableRow>
                  <TableCell colSpan={11} className="py-8 text-center text-slate-500">
                    No agents registered yet. Onboard a server to see it here.
                  </TableCell>
                </TableRow>
              )}
              {servers.map((s) => (
                <TableRow
                  key={s.id}
                  className="cursor-pointer"
                  onClick={() => navigate(`/servers/${s.id}`)}
                >
                  <TableCell>
                    <span className="font-medium">{siteName(s.site_id)}</span>
                  </TableCell>
                  <TableCell className="text-slate-400">{siteLocation(s.site_id)}</TableCell>
                  <TableCell><StatusBadge status={s.status} /></TableCell>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-300">{s.hostname}</TableCell>
                  <TableCell className="font-mono text-xs text-slate-400">
                    {s.ip_address ?? "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.latest ? `${s.latest.cpu_percent.toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.latest ? `${s.latest.memory_percent.toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right font-mono">
                    {s.latest ? `${s.latest.disk_percent.toFixed(1)}%` : "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {s.latest ? formatUptime(s.latest.uptime_seconds) : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {formatTime(s.last_seen_at)}
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