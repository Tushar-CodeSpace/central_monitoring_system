import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, Copy, Download, MapPin } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { ApiKey, ConfigSnapshotFull, ConfigSnapshotMeta, Metric, Server, Service, Site } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ServiceBadge, StatusBadge } from "@/components/StatusBadge";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatBytes, formatTime, formatUptime, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { showToast } from "@/components/ToastHost";

const RANGES = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
  { label: "7d", minutes: 10080 },
  { label: "30d", minutes: 43200 },
];

export default function ServerDetail() {
  const { id } = useParams<{ id: string }>();
  const [server, setServer] = useState<Server | null>(null);
  const [site, setSite] = useState<Site | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [snapMeta, setSnapMeta] = useState<ConfigSnapshotMeta[] | null>(null);
  const [expandedSnap, setExpandedSnap] = useState<string | null>(null);
  const [snapDocs, setSnapDocs] = useState<Record<string, Record<string, unknown>[]>>({});
  const [loadingSnapDocs, setLoadingSnapDocs] = useState<string | null>(null);
  const [exporting, setExporting] = useState<string | null>(null);
  const [range, setRange] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");

  async function loadMetrics() {
    if (!id) return;
    const m = await apiFetch<Metric[]>(`/metrics/servers/${id}?minutes=${range}`);
    setMetrics(m);
  }

  async function load() {
    if (!id) return;
    const [s, svc, k, sites] = await Promise.all([
      apiFetch<Server>(`/servers/${id}`),
      apiFetch<Service[]>(`/servers/${id}/services`),
      apiFetch<ApiKey[]>(`/servers/${id}/api-keys`),
      apiFetch<Site[]>("/sites"),
    ]);
    setSite(sites.find((x) => x.id === s.site_id) ?? null);
    setServer(s);
    setServices(svc);
    setKeys(k);
    await loadMetrics();
  }

  async function loadSnapshots() {
    if (!id) return;
    const metas = await apiFetch<ConfigSnapshotMeta[]>(`/configs/servers/${id}`);
    setSnapMeta(metas);
  }

  async function fetchSnapshotDocuments(snapshotId: string): Promise<Record<string, unknown>[]> {
    if (snapDocs[snapshotId]) return snapDocs[snapshotId];
    setLoadingSnapDocs(snapshotId);
    try {
      const full = await apiFetch<ConfigSnapshotFull & { server_id: string }>(
        `/configs/snapshots/${snapshotId}`
      );
      const docs = full.documents ?? [];
      setSnapDocs((prev) => ({ ...prev, [snapshotId]: docs }));
      return docs;
    } finally {
      setLoadingSnapDocs(null);
    }
  }

  function toggleView(meta: ConfigSnapshotMeta) {
    if (expandedSnap === meta.id) {
      setExpandedSnap(null);
      return;
    }
    setExpandedSnap(meta.id);
    void fetchSnapshotDocuments(meta.id);
  }

  async function copySnapshot(meta: ConfigSnapshotMeta) {
    const docs = await fetchSnapshotDocuments(meta.id);
    try {
      await navigator.clipboard.writeText(JSON.stringify(docs, null, 2));
      showToast({ severity: "info", title: "Copied", message: `${meta.database}.${meta.collection} JSON copied.` });
    } catch {
      showToast({ severity: "critical", title: "Copy failed", message: "Clipboard unavailable." });
    }
  }

  function saveBlob(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function downloadSnapshot(meta: ConfigSnapshotMeta) {
    const docs = await fetchSnapshotDocuments(meta.id);
    const body = {
      database: meta.database,
      collection: meta.collection,
      captured_at: meta.captured_at,
      received_at: meta.received_at,
      count: meta.count,
      documents: docs,
    };
    saveBlob(
      new Blob([JSON.stringify(body, null, 2)], { type: "application/json" }),
      `${meta.database}.${meta.collection}.json`
    );
  }

  async function downloadAllConfigs() {
    if (!snapMeta || !snapMeta.length || !site) return;
    setExporting(`Exporting 0/${snapMeta.length}…`);
    try {
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      let done = 0;
      for (const meta of snapMeta) {
        setExporting(`Exporting ${done + 1}/${snapMeta.length}…`);
        const docs = await fetchSnapshotDocuments(meta.id);
        zip.file(
          `${meta.database}.${meta.collection}.json`,
          JSON.stringify(
            {
              database: meta.database,
              collection: meta.collection,
              captured_at: meta.captured_at,
              received_at: meta.received_at,
              count: meta.count,
              truncated: meta.truncated,
              documents: docs,
            },
            null,
            2
          )
        );
        done += 1;
      }
      const stamp = new Date().toISOString().slice(0, 16).replace("T", "_").replace(":", "-");
      const safe = (v: string) => v.replace(/[^A-Za-z0-9_-]+/g, "_");
      const zipName = `${safe(site.client)}_${safe(site.location)}_${stamp}.zip`;
      const blob = await zip.generateAsync({ type: "blob" });
      saveBlob(blob, zipName);
      showToast({ severity: "info", title: "Export ready", message: zipName });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Export failed",
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setExporting(null);
    }
  }

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : "Failed to load"));
    loadSnapshots().catch(() => setSnapMeta([]));
    const t = setInterval(() => {
      load().catch(() => {});
    }, 30000); // fallback; socket keeps it live

    const socket = getSocket();
    if (id) socket.emit("join", id);

    const onMetric = (m: Metric) => {
      if (m.server_id !== id) return;
      setMetrics((prev) => {
        const next = [...prev.filter((x) => x.recorded_at < m.recorded_at), m];
        return next.slice(-1000);
      });
      setServer((prev) => (prev ? { ...prev, last_seen_at: m.recorded_at } : prev));
    };
    const onServiceUpdate = (d: { server_id: string }) => {
      if (d.server_id === id) {
        apiFetch<Service[]>(`/servers/${id}/services`).then(setServices).catch(() => {});
      }
    };
    const onStatus = (d: { server_id: string; status: Server["status"] }) => {
      if (d.server_id === id) {
        setServer((prev) => (prev ? { ...prev, status: d.status } : prev));
      }
    };

    socket.on("metric", onMetric);
    socket.on("service_update", onServiceUpdate);
    socket.on("server_status", onStatus);
    return () => {
      clearInterval(t);
      if (id) socket.emit("leave", id);
      socket.off("metric", onMetric);
      socket.off("service_update", onServiceUpdate);
      socket.off("server_status", onStatus);
    };
  }, [id, range]);

  async function createKey() {
    if (!id) return;
    const res = await apiFetch<ApiKey & { raw_key: string }>(`/servers/${id}/api-keys`, {
      method: "POST",
      body: JSON.stringify({ name: keyName || "agent" }),
    });
    setNewKey(res.raw_key);
    setKeyName("");
    const k = await apiFetch<ApiKey[]>(`/servers/${id}/api-keys`);
    setKeys(k);
  }

  async function revokeKey(keyId: string) {
    if (!id) return;
    await apiFetch(`/api-keys/${keyId}`, { method: "DELETE" });
    const k = await apiFetch<ApiKey[]>(`/servers/${id}/api-keys`);
    setKeys(k);
  }

  const chartData = metrics.map((m) => ({
    time: new Date(m.recorded_at).toLocaleTimeString(),
    cpu: m.cpu_percent,
    memory: m.memory_percent,
    disk: m.disk_percent,
    sent: m.network_bytes_sent / (1024 * 1024),
    received: m.network_bytes_received / (1024 * 1024),
  }));

  if (!server) {
    return (
      <div className="flex flex-col gap-6">
        {error && <p className="text-sm text-red-400">{error}</p>}
        <div className="flex items-center justify-between">
          <div className="flex flex-col gap-2">
            <Skeleton className="h-7 w-64" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <Skeleton className="h-8 w-24 rounded-full" />
        </div>

        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-4 w-20" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-8 w-16" />
              </CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-32" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-[280px] w-full" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <Skeleton className="h-4 w-24" />
          </CardHeader>
          <CardContent>
            <Table>
              <TableBody>
                {Array.from({ length: 3 }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 4 }).map((_, j) => (
                      <TableCell key={j}>
                        <Skeleton className="h-4 w-full max-w-[120px]" />
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    );
  }

  const latest = metrics[metrics.length - 1];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          {site && (
            <div className="mb-1.5 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-medium text-emerald-300">
                <Building2 className="h-3 w-3" />
                {site.client}
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-sky-500/25 bg-sky-500/10 px-2.5 py-0.5 text-xs font-medium text-sky-300">
                <MapPin className="h-3 w-3" />
                {site.location}
              </span>            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{server.name}</h1>
          <p className="text-sm text-slate-400">
            {server.hostname} · {server.ip_address ?? "no IP"} · last seen {formatTime(server.last_seen_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          {(() => {
            const DOT: Record<string, { ping: string; core: string }> = {
              online: { ping: "bg-emerald-400", core: "bg-emerald-500" },
              warning: { ping: "bg-amber-400", core: "bg-amber-500" },
              offline: { ping: "bg-red-400", core: "bg-red-500" },
              unknown: { ping: "bg-slate-400", core: "bg-slate-500" },
            };
            const dot = DOT[server.status] ?? DOT.unknown;
            return (
              <span className="relative flex h-2 w-2">
                <span
                  className={cn(
                    "absolute inline-flex h-full w-full animate-ping rounded-full opacity-75",
                    dot.ping
                  )}
                ></span>
                <span className={cn("relative inline-flex h-2 w-2 rounded-full", dot.core)}></span>
              </span>
            );
          })()}
          <StatusBadge status={server.status} />
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Card>
          <CardHeader><CardTitle className="text-sm text-slate-400">CPU</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{latest ? `${latest.cpu_percent}%` : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-slate-400">Memory</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{latest ? `${latest.memory_percent}%` : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-slate-400">Disk</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{latest ? `${latest.disk_percent}%` : "—"}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-slate-400">Uptime</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatUptime(latest?.uptime_seconds)}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-sm text-slate-400">RAM total</CardTitle></CardHeader>
          <CardContent className="text-2xl font-bold">{formatBytes(latest?.memory_total)}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Resource usage</CardTitle>
          <div className="flex gap-1">
            {RANGES.map((r) => (
              <Button
                key={r.minutes}
                variant={range === r.minutes ? "default" : "ghost"}
                size="sm"
                onClick={() => setRange(r.minutes)}
              >
                {r.label}
              </Button>
            ))}
          </div>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
              <YAxis stroke="#64748b" fontSize={11} domain={[0, 100]} />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
              <Line type="monotone" dataKey="cpu" stroke="#38bdf8" name="CPU %" dot={false} />
              <Line type="monotone" dataKey="memory" stroke="#a78bfa" name="Memory %" dot={false} />
              <Line type="monotone" dataKey="disk" stroke="#fbbf24" name="Disk %" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {chartData.length > 1 && (
        <Card>
          <CardHeader><CardTitle className="text-sm">Network traffic (MB/s)</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                <YAxis stroke="#64748b" fontSize={11} />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155" }} />
                <Line type="monotone" dataKey="sent" stroke="#34d399" name="Sent" dot={false} />
                <Line type="monotone" dataKey="received" stroke="#f472b6" name="Received" dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle className="text-sm">Services</CardTitle></CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Port</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Last checked</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {services.length === 0 && (
                <TableRow><TableCell colSpan={4} className="text-slate-500">No services reported yet.</TableCell></TableRow>
              )}
              {services.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell>{s.port ?? "—"}</TableCell>
                  <TableCell><ServiceBadge status={s.status} /></TableCell>
                  <TableCell>{formatTime(s.last_checked_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Agent API keys</CardTitle>
          <div className="flex gap-2">
            <input
              className="h-8 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs"
              placeholder="key name"
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
            />
            <Button size="sm" onClick={createKey}>New key</Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {newKey && (
            <div className="rounded-md border border-emerald-700 bg-emerald-900/30 p-3 text-sm">
              <p className="font-medium text-emerald-300">Save this key now — it is shown only once:</p>
              <code className="mt-1 block break-all text-emerald-100">{newKey}</code>
            </div>
          )}
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Last used</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.length === 0 && (
                <TableRow><TableCell colSpan={5} className="text-slate-500">No keys yet.</TableCell></TableRow>
              )}
              {keys.map((k) => (
                <TableRow key={k.id}>
                  <TableCell className="font-medium">{k.name}</TableCell>
                  <TableCell>
                    <Badge variant={k.status === "active" ? "green" : "slate"}>{k.status}</Badge>
                  </TableCell>
                  <TableCell>{formatTime(k.created_at)}</TableCell>
                  <TableCell>{formatTime(k.last_used_at)}</TableCell>
                  <TableCell>
                    {k.status === "active" && (
                      <Button variant="destructive" size="sm" onClick={() => revokeKey(k.id)}>Revoke</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Site MongoDB config backups */}
      <Card>
        <CardHeader className="flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-sm">Site config backups</CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Latest MongoDB config snapshots uploaded by the agent.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={() => void loadSnapshots()}>
              Refresh
            </Button>
            <Button
              size="sm"
              disabled={!snapMeta || snapMeta.length === 0 || !!exporting}
              onClick={() => void downloadAllConfigs()}
            >
              <Download className="mr-1 h-4 w-4" />
              {exporting ?? "Download all (.zip)"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {!snapMeta ? (
            <div className="flex flex-col gap-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : snapMeta.length === 0 ? (
            <p className="text-sm text-slate-500">
              No config snapshots yet — the agent hasn’t synced any site configs.
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Database</TableHead>
                  <TableHead>Collection</TableHead>
                  <TableHead>Docs</TableHead>
                  <TableHead>Captured</TableHead>
                  <TableHead>Received</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {snapMeta.map((meta) => (
                  <>
                    <TableRow
                      key={meta.id}
                      className={cn("cursor-pointer hover:bg-slate-800/50", expandedSnap === meta.id && "bg-slate-800/40")}
                      onClick={() => toggleView(meta)}
                    >
                      <TableCell className="font-medium">{meta.database}</TableCell>
                      <TableCell className="font-mono text-xs">{meta.collection}</TableCell>
                      <TableCell>{meta.count}{meta.truncated && <span title="truncated"> +…</span>}</TableCell>
                      <TableCell className="text-xs text-slate-400">{formatTime(meta.captured_at)}</TableCell>
                      <TableCell className="text-xs text-slate-400">{formatTime(meta.received_at)}</TableCell>
                      <TableCell className="text-right">
                        <span className="inline-flex gap-1">
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); toggleView(meta); }}>
                            {expandedSnap === meta.id ? "Hide" : loadingSnapDocs === meta.id ? "…" : "View"}
                          </Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void copySnapshot(meta); }} title="Copy JSON">
                            <Copy className="h-3.5 w-3.5" />
                          </Button>
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void downloadSnapshot(meta); }} title="Download JSON">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </span>
                      </TableCell>
                    </TableRow>
                    {expandedSnap === meta.id && (
                      <TableRow key={`${meta.id}-json`}>
                        <TableCell colSpan={6} className="p-0">
                          <div className="flex items-center justify-between border-y border-slate-800 bg-black/50 px-3 py-1.5">
                            <span className="font-mono text-[11px] text-slate-500">
                              {meta.database}.{meta.collection}.json · {meta.count} documents
                              {meta.truncated && " (truncated)"}
                            </span>
                            <button
                              onClick={async () => {
                                const docs = await fetchSnapshotDocuments(meta.id);
                                await navigator.clipboard.writeText(JSON.stringify(docs, null, 2));
                                showToast({ severity: "info", title: "Copied" });
                              }}
                              className="flex items-center gap-1 rounded px-2 py-0.5 text-[11px] text-slate-400 transition-colors hover:bg-slate-800 hover:text-slate-100"
                            >
                              <Copy className="h-3 w-3" /> Copy
                            </button>
                          </div>
                          <pre className="max-h-96 overflow-auto bg-black/60 p-4 font-mono text-[11px] leading-relaxed text-emerald-200/90">
                            {loadingSnapDocs === meta.id
                              ? "Loading documents…"
                              : JSON.stringify(snapDocs[meta.id] ?? [], null, 2)}
                          </pre>
                        </TableCell>
                      </TableRow>
                    )}
                  </>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}