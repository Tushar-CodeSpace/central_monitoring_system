import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Building2, Clock, Copy, Download, FileSpreadsheet, MapPin, Save, ListChecks } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { getSocket } from "@/lib/socket";
import type { AgentConfig, ApiKey, ConfigSnapshotFull, ConfigSnapshotMeta, Metric, Server, Service, Site } from "@/lib/types";
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
import { formatTime, cn } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
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
  const { isAdmin } = useAuth();
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
  const [historyFor, setHistoryFor] = useState<{ rowId: string; database: string; collection: string } | null>(null);
  const [historyItems, setHistoryItems] = useState<ConfigSnapshotMeta[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [range, setRange] = useState(60);
  const [error, setError] = useState<string | null>(null);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [keyName, setKeyName] = useState("");
  const [agentCfg, setAgentCfg] = useState<AgentConfig | null>(null);
  const [savingCfg, setSavingCfg] = useState(false);
  const [newDbName, setNewDbName] = useState("");

  function exportMetricsCsv() {
    if (!metrics.length || !server) return;
    const headers = [
      "Timestamp",
      "CPU (%)",
      "Memory (%)",
      "Disk (%)",
      "Disk Read MB/s",
      "Disk Write MB/s",
      "Disk IOPS",
      "API Total Requests",
      "API 4xx Errors",
      "API 5xx Errors",
      "Uptime (s)",
    ];
    const rows = metrics.map((m) => [
      m.recorded_at,
      m.cpu_percent,
      m.memory_percent,
      m.disk_percent,
      m.disk_read_rate_mb ?? 0,
      m.disk_write_rate_mb ?? 0,
      m.disk_iops ?? 0,
      m.api_requests_total ?? 0,
      m.api_requests_4xx ?? 0,
      m.api_requests_5xx ?? 0,
      m.uptime_seconds,
    ]);
    const csvContent =
      "data:text/csv;charset=utf-8," +
      [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `${server.name}_metrics_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast({ severity: "info", title: "Metrics exported", message: "Downloaded metrics CSV report." });
  }

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

  async function loadAgentConfig() {
    if (!id) return;
    const cfg = await apiFetch<AgentConfig>(`/agent-config/${id}`).catch(() => null);
    if (cfg) setAgentCfg(cfg);
  }

  async function saveAgentCfg() {
    if (!id || !agentCfg) return;
    setSavingCfg(true);
    try {
      const saved = await apiFetch<AgentConfig>(`/agent-config/${id}`, {
        method: "PATCH",
        body: JSON.stringify({
          config_sync_enabled: agentCfg.config_sync_enabled,
          config_sync_hour: agentCfg.config_sync_hour,
          monitored_services: agentCfg.monitored_services,
          config_collections: agentCfg.config_collections,
        }),
      });
      setAgentCfg(saved);
      showToast({
        severity: "info",
        title: "Agent config saved",
        message: "The agent will reflect this change within a few seconds.",
      });
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Save failed",
        message: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setSavingCfg(false);
    }
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
    setHistoryFor(null);
    if (expandedSnap === meta.id) {
      setExpandedSnap(null);
      return;
    }
    setExpandedSnap(meta.id);
    void fetchSnapshotDocuments(meta.id);
  }

  async function openHistory(meta: ConfigSnapshotMeta) {
    setExpandedSnap(null);
    if (historyFor?.rowId === meta.id) {
      setHistoryFor(null);
      return;
    }
    setHistoryFor({ rowId: meta.id, database: meta.database, collection: meta.collection });
    setLoadingHistory(true);
    try {
      const items = await apiFetch<ConfigSnapshotMeta[]>(
        `/configs/servers/${id}/history?database=${encodeURIComponent(meta.database)}&collection=${encodeURIComponent(meta.collection)}`
      );
      setHistoryItems(items);
    } catch (err) {
      showToast({
        severity: "critical",
        title: "Failed to load history",
        message: err instanceof Error ? err.message : undefined,
      });
      setHistoryItems([]);
    } finally {
      setLoadingHistory(false);
    }
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
    loadAgentConfig().catch(() => {});
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
    diskReadRate: m.disk_read_rate_mb ?? 0,
    diskWriteRate: m.disk_write_rate_mb ?? 0,
    diskIops: m.disk_iops ?? 0,
    apiRequests: m.api_requests_total ?? 0,
    apiErrors4xx: m.api_requests_4xx ?? 0,
    apiErrors5xx: m.api_requests_5xx ?? 0,
    apiErrorRate: m.api_error_rate_percent ?? 0,
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

  // Compute Peak (Max) and Avg over selected metrics window
  const stats = metrics.reduce(
    (acc, m) => {
      acc.cpuMax = Math.max(acc.cpuMax, m.cpu_percent);
      acc.cpuSum += m.cpu_percent;
      acc.memMax = Math.max(acc.memMax, m.memory_percent);
      acc.memSum += m.memory_percent;
      acc.diskMax = Math.max(acc.diskMax, m.disk_percent);
      acc.diskSum += m.disk_percent;

      const rRate = m.disk_read_rate_mb ?? 0;
      acc.readMax = Math.max(acc.readMax, rRate);
      acc.readSum += rRate;

      const wRate = m.disk_write_rate_mb ?? 0;
      acc.writeMax = Math.max(acc.writeMax, wRate);
      acc.writeSum += wRate;

      const iops = m.disk_iops ?? 0;
      acc.iopsMax = Math.max(acc.iopsMax, iops);
      acc.iopsSum += iops;

      acc.count += 1;
      return acc;
    },
    {
      cpuMax: 0,
      cpuSum: 0,
      memMax: 0,
      memSum: 0,
      diskMax: 0,
      diskSum: 0,
      readMax: 0,
      readSum: 0,
      writeMax: 0,
      writeSum: 0,
      iopsMax: 0,
      iopsSum: 0,
      count: 0,
    }
  );

  const statCount = stats.count || 1;
  const avgCpu = (stats.cpuSum / statCount).toFixed(1);
  const avgMem = (stats.memSum / statCount).toFixed(1);
  const avgRead = (stats.readSum / statCount).toFixed(1);
  const avgWrite = (stats.writeSum / statCount).toFixed(1);
  const avgIops = Math.round(stats.iopsSum / statCount);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col items-start justify-between gap-3 sm:flex-row sm:items-center">
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
              </span>
            </div>
          )}
          <h1 className="text-2xl font-bold tracking-tight">{server.name}</h1>
          <p className="text-sm text-slate-400">
            {server.hostname} · {server.ip_address ?? "no IP"} · last seen {formatTime(server.last_seen_at)}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={exportMetricsCsv} title="Export server metrics CSV">
            <FileSpreadsheet className="mr-1.5 h-4 w-4 text-emerald-400" />
            Export Metrics CSV
          </Button>

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

      {/* KPI Cards with Peak & Avg Window Stats */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-6">
        <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">CPU Load</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-sky-400">{latest ? `${latest.cpu_percent}%` : "—"}</div>
            {latest && (
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-sky-500 to-indigo-500 transition-all duration-500"
                  style={{ width: `${Math.min(latest.cpu_percent, 100)}%` }}
                />
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
              <span>Avg: {avgCpu}%</span>
              <span className="text-sky-300 font-semibold">Peak: {stats.cpuMax}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">Memory</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-purple-400">{latest ? `${latest.memory_percent}%` : "—"}</div>
            {latest && (
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-500"
                  style={{ width: `${Math.min(latest.memory_percent, 100)}%` }}
                />
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
              <span>Avg: {avgMem}%</span>
              <span className="text-purple-300 font-semibold">Peak: {stats.memMax}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">Disk Space</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-amber-400">{latest ? `${latest.disk_percent}%` : "—"}</div>
            {latest && (
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-500 to-orange-500 transition-all duration-500"
                  style={{ width: `${Math.min(latest.disk_percent, 100)}%` }}
                />
              </div>
            )}
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
              <span>Used: {latest ? `${latest.disk_percent}%` : "—"}</span>
              <span className="text-amber-300 font-semibold">Peak: {stats.diskMax}%</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">Disk Read</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-emerald-400">{latest ? `${latest.disk_read_rate_mb ?? 0} MB/s` : "—"}</div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
              <span>Avg: {avgRead} MB/s</span>
              <span className="text-emerald-300 font-semibold">Peak: {stats.readMax} MB/s</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">Disk Write</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-teal-400">{latest ? `${latest.disk_write_rate_mb ?? 0} MB/s` : "—"}</div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
              <span>Avg: {avgWrite} MB/s</span>
              <span className="text-teal-300 font-semibold">Peak: {stats.writeMax} MB/s</span>
            </div>
          </CardContent>
        </Card>

        <Card className="relative overflow-hidden transition-all duration-300 hover:-translate-y-0.5">
          <CardHeader className="pb-1"><CardTitle className="text-xs font-semibold uppercase tracking-wider text-slate-400">Disk IOPS</CardTitle></CardHeader>
          <CardContent>
            <div className="text-2xl font-extrabold text-cyan-400">{latest ? `${latest.disk_iops ?? 0} ops/s` : "—"}</div>
            <div className="mt-2 flex items-center justify-between text-[10px] font-mono text-slate-400 border-t border-slate-800/60 pt-1.5">
              <span>Avg: {avgIops} ops/s</span>
              <span className="text-cyan-300 font-semibold">Peak: {stats.iopsMax} ops/s</span>
            </div>
          </CardContent>
        </Card>
      </div>



      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-sm">Resource usage</CardTitle>
          <div className="flex flex-wrap gap-1">
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
            <AreaChart data={chartData}>
              <defs>
                <linearGradient id="cpuGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#a78bfa" stopOpacity={0.0} />
                </linearGradient>
                <linearGradient id="diskGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
              <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
              <YAxis
                stroke="#64748b"
                fontSize={11}
                domain={[0, (dataMax: number) => Math.min(100, Math.max(10, Math.ceil(dataMax * 1.15)))]}
                tickFormatter={(v) => `${v}%`}
              />
              <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "12px" }} />
              <Area type="monotone" dataKey="cpu" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#cpuGrad)" name="CPU %" />
              <Area type="monotone" dataKey="memory" stroke="#a78bfa" strokeWidth={2} fillOpacity={1} fill="url(#memGrad)" name="Memory %" />
              <Area type="monotone" dataKey="disk" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#diskGrad)" name="Disk %" />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {chartData.length > 1 && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Disk I/O Throughput (MB/s)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="readGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#34d399" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#34d399" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="writeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#fbbf24" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#fbbf24" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "12px" }} />
                  <Area type="monotone" dataKey="diskReadRate" stroke="#34d399" strokeWidth={2} fillOpacity={1} fill="url(#readGrad)" name="Read MB/s" />
                  <Area type="monotone" dataKey="diskWriteRate" stroke="#fbbf24" strokeWidth={2} fillOpacity={1} fill="url(#writeGrad)" name="Write MB/s" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-sm font-semibold">Network traffic (MB/s)</CardTitle></CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="sentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#38bdf8" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="recvGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f472b6" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="#f472b6" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                  <YAxis stroke="#64748b" fontSize={11} />
                  <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "12px" }} />
                  <Area type="monotone" dataKey="sent" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#sentGrad)" name="Sent MB/s" />
                  <Area type="monotone" dataKey="received" stroke="#f472b6" strokeWidth={2} fillOpacity={1} fill="url(#recvGrad)" name="Received MB/s" />
                </AreaChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
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
          {isAdmin && (
            <div className="flex flex-wrap gap-2">
              <input
                className="h-8 rounded-md border border-slate-700 bg-slate-950 px-3 text-xs"
                placeholder="key name"
                value={keyName}
                onChange={(e) => setKeyName(e.target.value)}
              />
              <Button size="sm" onClick={createKey}>New key</Button>
            </div>
          )}
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
                    {isAdmin && k.status === "active" && (
                      <Button variant="destructive" size="sm" onClick={() => revokeKey(k.id)}>Revoke</Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Agent runtime config */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="flex items-center gap-2 text-sm">
              <ListChecks className="h-4 w-4 text-emerald-400" />
              Agent config (central)
            </CardTitle>
            <p className="mt-0.5 text-xs text-slate-500">
              Centrally managed per-server overrides for this site's agent — no site redeploy needed.
              Agents reflect changes within a few seconds.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={() => void loadAgentConfig()}>
            Refresh
          </Button>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {!agentCfg ? (
            <Skeleton className="h-28 w-full" />
          ) : (
            <>
              <div className="flex items-center gap-3">
                <label className="flex cursor-pointer select-none items-center gap-2">
                  <input
                    type="checkbox"
                    disabled={!isAdmin}
                    checked={agentCfg.config_sync_enabled}
                    onChange={(e) => setAgentCfg({ ...agentCfg, config_sync_enabled: e.target.checked })}
                    className="h-4 w-4 accent-emerald-500 disabled:opacity-50"
                  />
                  <span className="text-sm text-slate-300">Config backup enabled</span>
                </label>
                <div className="flex items-center gap-2">
                  <Label className="text-xs text-slate-400">Backup hour (0-23):</Label>
                  <input
                    type="number"
                    min={0}
                    max={23}
                    disabled={!isAdmin}
                    value={agentCfg.config_sync_hour}
                    onChange={(e) => setAgentCfg({ ...agentCfg, config_sync_hour: Number(e.target.value) })}
                    className="h-8 w-16 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-400">Monitored services (name[:port], comma separated)</Label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={agentCfg.monitored_services.join(", ")}
                  onChange={(e) =>
                    setAgentCfg({
                      ...agentCfg,
                      monitored_services: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                    })
                  }
                  className="h-9 w-full rounded-md border border-slate-700 bg-slate-900 px-3 text-xs text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50"
                  placeholder="api:8080, uploader:9000"
                />
              </div>

              <div className="flex flex-col gap-1.5">
                <Label className="text-xs text-slate-400">Config collections (database = collection1, collection2)</Label>
                <div className="flex flex-col gap-2">
                  {agentCfg.config_collections.map((spec, di) => (
                    <div key={di} className="flex flex-col gap-1 rounded-lg border border-slate-800 bg-slate-950/40 p-2">
                      <div className="flex items-center gap-2">
                        <span className="w-fit min-w-40 rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-[11px] text-emerald-300">
                          {spec.database}
                        </span>
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={!isAdmin || agentCfg.config_collections.length <= 1}
                          onClick={() =>
                            setAgentCfg({
                              ...agentCfg,
                              config_collections: agentCfg.config_collections.filter((_, i) => i !== di),
                            })
                          }
                          className="h-6 text-xs text-red-400 hover:text-red-300 disabled:opacity-30"
                        >
                          Remove
                        </Button>
                      </div>
                      <input
                        type="text"
                        disabled={!isAdmin}
                        value={spec.collections.join(", ")}
                        onChange={(e) => {
                          const cols = e.target.value.split(",").map((c) => c.trim()).filter(Boolean);
                          const next = [...agentCfg.config_collections];
                          next[di] = { ...spec, collections: cols };
                          setAgentCfg({ ...agentCfg, config_collections: next });
                        }}
                        className="h-8 w-full rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-emerald-500 disabled:opacity-50"
                      />
                    </div>
                  ))}
                  {isAdmin && (
                    <div className="flex gap-2">
                      <input
                        type="text"
                        placeholder="new database name"
                        value={newDbName}
                        onChange={(e) => setNewDbName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const name = newDbName.trim();
                            if (!name) return;
                            setAgentCfg({
                              ...agentCfg,
                              config_collections: [...agentCfg.config_collections, { database: name, collections: [] }],
                            });
                            setNewDbName("");
                          }
                        }}
                        className="h-8 w-1/3 rounded-md border border-slate-700 bg-slate-900 px-2 text-xs text-slate-200 outline-none focus:border-emerald-500"
                      />
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          const name = newDbName.trim();
                          if (!name) return;
                          setAgentCfg({
                            ...agentCfg,
                            config_collections: [...agentCfg.config_collections, { database: name, collections: [] }],
                          });
                          setNewDbName("");
                        }}
                      >
                        Add collection
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {isAdmin && (
                <Button
                  onClick={() => void saveAgentCfg()}
                  disabled={savingCfg}
                  className="mt-1 self-start"
                  size="sm"
                >
                  <Save className="mr-1.5 h-3.5 w-3.5" />
                  {savingCfg ? "Saving…" : "Save agent config"}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Site MongoDB config backups */}
      <Card>
        <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
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
                          <Button variant="ghost" size="sm" onClick={(e) => { e.stopPropagation(); void openHistory(meta); }} title="Version history">
                            <Clock className="h-3.5 w-3.5" />
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
                    {historyFor && historyFor.rowId === meta.id && (
                      <TableRow key={`${meta.id}-history`}>
                        <TableCell colSpan={6} className="bg-black/30 p-0">
                          <div className="border-y border-slate-800 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            {meta.database}.{meta.collection} — version history
                          </div>
                          {loadingHistory ? (
                            <div className="space-y-2 p-3">
                              <Skeleton className="h-4 w-full" />
                              <Skeleton className="h-4 w-full" />
                            </div>
                          ) : (
                            <Table>
                              <TableHeader>
                                <TableRow>
                                  <TableHead className="pl-6">Received (newest first)</TableHead>
                                  <TableHead>Captured</TableHead>
                                  <TableHead>Docs</TableHead>
                                  <TableHead>Hash</TableHead>
                                  <TableHead className="text-right">Actions</TableHead>
                                </TableRow>
                              </TableHeader>
                              <TableBody>
                                {historyItems.map((h) => (
                                  <TableRow key={h.id}>
                                    <TableCell className="pl-6">{formatTime(h.received_at)}</TableCell>
                                    <TableCell>{formatTime(h.captured_at)}</TableCell>
                                    <TableCell>{h.count}{h.truncated && " +"}</TableCell>
                                    <TableCell className="font-mono text-xs text-slate-500">{h.content_hash.slice(0, 10)}</TableCell>
                                    <TableCell className="text-right">
                                      <span className="inline-flex gap-1">
                                        <Button variant="ghost" size="sm" onClick={() => toggleView(h)}>View</Button>
                                        <Button variant="ghost" size="sm" onClick={() => void downloadSnapshot(h)} title={`Download ${h.database}.${h.collection}.json`}>
                                          <Download className="h-3.5 w-3.5" />
                                        </Button>
                                      </span>
                                    </TableCell>
                                  </TableRow>
                                ))}
                              </TableBody>
                            </Table>
                          )}
                        </TableCell>
                      </TableRow>
                    )}
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