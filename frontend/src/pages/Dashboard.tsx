import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  AlertTriangle,
  Copy,
  Plus,
  Rocket,
  Server as ServerIcon,
  Trash2,
  Wifi,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { LatestMetric, Server, Site } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Registered {
  siteId: string;
  serverId: string;
  name: string;
  key: string;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<DashboardServer[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [clientFilter, setClientFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showAdd, setShowAdd] = useState(false);
  const [registered, setRegistered] = useState<Registered | null>(null);
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);
  const [form, setForm] = useState({
    client: "",
    location: "",
    name: "",
    monitored_services: "",
  });
  const [deleteTarget, setDeleteTarget] = useState<DashboardServer | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

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
        prev.map((s) =>
          s.id === server_id ? { ...s, latest: rest, last_seen_at: rest.recorded_at } : s
        )
      );
    };
    const onAlert = () => load();

    const onServerCreated = (s: Server) => {
      setServers((prev) =>
        prev.some((x) => x.id === s.id) ? prev : [...prev, { ...s, latest: null }]
      );
      if (!joined.has(s.id)) {
        socket.emit("join", s.id);
        joined.add(s.id);
      }
      // a new client/site may have been registered alongside the server
      apiFetch<Site[]>("/sites").then(setSites).catch(() => {});
    };
    const onServerUpdated = (s: Server) => {
      setServers((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...s } : x)));
    };
    const onServerDeleted = (d: { server_id: string }) => {
      setServers((prev) => prev.filter((x) => x.id !== d.server_id));
      if (joined.has(d.server_id)) {
        socket.emit("leave", d.server_id);
        joined.delete(d.server_id);
      }
    };

    socket.on("server_status", onStatus);
    socket.on("metric", onMetric);
    socket.on("alert_opened", onAlert);
    socket.on("alert_resolved", onAlert);
    socket.on("server_created", onServerCreated);
    socket.on("server_updated", onServerUpdated);
    socket.on("server_deleted", onServerDeleted);

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
      socket.off("server_created", onServerCreated);
      socket.off("server_updated", onServerUpdated);
      socket.off("server_deleted", onServerDeleted);
      for (const id of joined) socket.emit("leave", id);
    };
  }, []);

  const clients = [...new Set(sites.map((s) => s.client))].sort();
  const statuses = ["online", "warning", "offline", "unknown"] as const;

  const filtered = servers.filter((s) => {
    if (clientFilter !== "all" && siteName(s.site_id) !== clientFilter) return false;
    if (statusFilter !== "all" && s.status !== statusFilter) return false;
    return true;
  });

  const selectCls =
    "rounded-lg border border-slate-700/60 bg-slate-900/70 px-2.5 py-1.5 text-xs text-slate-300 outline-none transition-colors focus:border-sky-500/60 [&>option]:bg-slate-900";

  const slug = (s: string) =>
    s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "") || "site";

  async function createSite(client: string, location: string): Promise<Site> {
    const base = slug(client);
    for (let i = 0; i < 10; i++) {
      const code = i === 0 ? base : `${base}_${i + 1}`;
      try {
        return await apiFetch<Site>("/sites", {
          method: "POST",
          body: JSON.stringify({ client, code, location }),
        });
      } catch (err) {
        if (err instanceof Error && err.message.includes("409")) continue;
        throw err;
      }
    }
    throw new Error("Could not create site (code collisions)");
  }

  async function addAgent() {
    setAdding(true);
    setAddError(null);
    try {
      const site = await createSite(form.client.trim(), form.location.trim());
      const server = await apiFetch<{ id: string; name: string }>("/servers", {
        method: "POST",
        body: JSON.stringify({
          site_id: site.id,
          name: form.name.trim(),
          hostname: form.name.trim(),
          ip_address: null,
        }),
      });
      const keyRes = await apiFetch<{ raw_key: string }>(`/servers/${server.id}/api-keys`, {
        method: "POST",
        body: JSON.stringify({ name: "agent" }),
      });
      setRegistered({
        siteId: site.id,
        serverId: server.id,
        name: server.name,
        key: keyRes.raw_key,
      });
      setForm({ client: "", location: "", name: "", monitored_services: "" });
      await load();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setAdding(false);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/servers/${deleteTarget.id}`, { method: "DELETE" });
      setServers((prev) => prev.filter((s) => s.id !== deleteTarget.id));
      setDeleteTarget(null);
      await load();
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      /* clipboard unavailable */
    }
  }

  // Status counts derived live from socket-updated server rows; the API
  // totals only provide the base numbers (sites/active alerts).
  const liveTotals = totals
    ? {
        ...totals,
        servers: servers.length,
        online: servers.filter((s) => s.status === "online").length,
        warning: servers.filter((s) => s.status === "warning").length,
        offline: servers.filter((s) => s.status === "offline").length,
        unknown: servers.filter((s) => s.status === "unknown").length,
      }
    : null;

  const cards = [
    { label: "Servers", value: liveTotals?.servers ?? 0, icon: ServerIcon, accent: "text-emerald-400", chip: "bg-emerald-500/10 border-emerald-500/30", ring: "hover:border-emerald-500/40" },
    { label: "Online", value: liveTotals?.online ?? 0, icon: Wifi, accent: "text-emerald-400", chip: "bg-emerald-500/10 border-emerald-500/30", ring: "hover:border-emerald-500/40" },
    { label: "Warning", value: liveTotals?.warning ?? 0, icon: Zap, accent: "text-amber-400", chip: "bg-amber-500/10 border-amber-500/30", ring: "hover:border-amber-500/40" },
    { label: "Offline", value: liveTotals?.offline ?? 0, icon: WifiOff, accent: "text-red-400", chip: "bg-red-500/10 border-red-500/30", ring: "hover:border-red-500/40" },
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
        <CardHeader className="flex-row items-center justify-between gap-4">
          <CardTitle className="text-sm">All agents</CardTitle>
          <div className="flex items-center gap-2">
            <select
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              className={selectCls}
            >
              <option value="all">Client: all</option>
              {clients.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className={selectCls}
            >
              <option value="all">Status: all</option>
              {statuses.map((st) => (
                <option key={st} value={st}>{st}</option>
              ))}
            </select>
            <Button size="sm" onClick={() => setShowAdd(true)}>
              <Plus className="mr-1 h-4 w-4" />
              Add agent
            </Button>
          </div>
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
                <TableHead className="w-10"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={12} className="py-8 text-center text-slate-500">
                    No agents match the current filters.
                  </TableCell>
                </TableRow>
              )}
              {filtered.map((s) => (
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
                  <TableCell>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteTarget(s);
                      }}
                      title="Remove agent"
                      className="rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-xl border border-slate-700/80 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center justify-between pb-3">
              <h2 className="text-sm font-semibold">Register agent</h2>
              <button
                onClick={() => {
                  setShowAdd(false);
                  setRegistered(null);
                  setAddError(null);
                }}
                className="rounded-lg p-1 text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {registered ? (
              <div className="flex flex-col gap-3">
                <p className="text-xs text-emerald-400">
                  Agent <span className="font-semibold">{registered.name}</span> registered. Set
                  these values on the agent in the site server — the key is shown only once.
                </p>
                <div className="rounded-lg border border-sky-500/30 bg-sky-500/5 p-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 break-all font-mono text-xs text-emerald-300">
                      {registered.key}
                    </code>
                    <Button variant="ghost" size="sm" onClick={() => copy(registered.key)}>
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <pre className="overflow-x-auto rounded-lg border border-slate-800 bg-black/60 p-3 font-mono text-xs leading-relaxed text-emerald-300">{`SITE_ID=${registered.siteId}
SERVER_ID=${registered.serverId}
API_URL=${window.location.origin}/api/v1
API_KEY=${registered.key}
MONITORING_INTERVAL=60
MONITORED_SERVICES=${form.monitored_services.trim() || "nginx,postgresql"}`}</pre>
                <Button
                  onClick={() => {
                    setShowAdd(false);
                    setRegistered(null);
                  }}
                  className="w-full"
                >
                  Done
                </Button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-slate-400">Client name</Label>
                  <Input
                    value={form.client}
                    onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                    placeholder="e.g. samsonite"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-slate-400">Location</Label>
                  <Input
                    value={form.location}
                    onChange={(e) => setForm((f) => ({ ...f, location: e.target.value }))}
                    placeholder="e.g. Nashik"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-slate-400">Equipment name</Label>
                  <Input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Conveyor Line 01"
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label className="text-xs text-slate-400">
                    Monitored services{" "}
                    <span className="text-slate-600">(optional, comma-separated)</span>
                  </Label>
                  <Input
                    value={form.monitored_services}
                    onChange={(e) => setForm((f) => ({ ...f, monitored_services: e.target.value }))}
                    placeholder="nginx,postgresql"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Hostname & IP are auto-detected from the agent's first request.
                </p>
                {addError && <p className="text-xs text-red-400">{addError}</p>}
                <Button
                  onClick={addAgent}
                  disabled={adding || !form.client || !form.location || !form.name}
                  className="w-full"
                >
                  <Rocket className="mr-2 h-4 w-4" />
                  {adding ? "Registering…" : "Add agent"}
                </Button>
              </div>
            )}
          </div>
        </div>
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-xl border border-red-500/30 bg-slate-900 p-5 shadow-2xl">
            <div className="flex items-center gap-2 pb-3">
              <AlertTriangle className="h-5 w-5 text-red-400" />
              <h2 className="text-sm font-semibold">Remove agent</h2>
            </div>
            <p className="text-xs leading-relaxed text-slate-400">
              Remove agent <span className="font-semibold text-slate-200">{deleteTarget.name}</span>?
              This permanently deletes the server with all its metrics, services, alerts and API
              keys. This cannot be undone.
            </p>
            {deleteError && <p className="mt-2 text-xs text-red-400">{deleteError}</p>}
            <div className="mt-4 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  setDeleteTarget(null);
                  setDeleteError(null);
                }}
              >
                Cancel
              </Button>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting}
                onClick={confirmDelete}
                className="bg-red-600 hover:bg-red-500"
              >
                {deleting ? "Deleting…" : "Confirm delete"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}