import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Cpu,
  HardDrive,
  Layers,
  MemoryStick,
  Square,
} from "lucide-react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { apiFetch } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import type { LatestMetric, Metric, Server, Site } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

interface ServerWithLatest extends Server {
  latest: LatestMetric | null;
}

const RANGES = [
  { label: "15m", minutes: 15 },
  { label: "1h", minutes: 60 },
  { label: "6h", minutes: 360 },
  { label: "24h", minutes: 1440 },
];

const PALETTE = ["#38bdf8", "#a78bfa", "#34d399", "#fbbf24", "#f472b6", "#fb7185"];

export default function Analytics() {
  const navigate = useNavigate();
  const [servers, setServers] = useState<ServerWithLatest[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [selectedServerIds, setSelectedServerIds] = useState<string[]>([]);
  const [serverMetricsMap, setServerMetricsMap] = useState<Record<string, Metric[]>>({});
  const [range, setRange] = useState(60);
  const [loading, setLoading] = useState(true);
  const [loadingMetrics, setLoadingMetrics] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s]));

  async function loadOverview() {
    try {
      const data = await apiFetch<{
        sites: Site[];
        servers: ServerWithLatest[];
      }>("/dashboard");
      setSites(data.sites);
      setServers(data.servers);

      // Default select up to 3 servers if none selected
      if (selectedServerIds.length === 0 && data.servers.length > 0) {
        setSelectedServerIds(data.servers.slice(0, 3).map((s) => s.id));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load site analytics");
    } finally {
      setLoading(false);
    }
  }

  async function loadComparisonMetrics(ids: string[], minutes: number) {
    if (ids.length === 0) {
      setServerMetricsMap({});
      return;
    }
    setLoadingMetrics(true);
    try {
      const results = await Promise.all(
        ids.map(async (id) => {
          const m = await apiFetch<Metric[]>(`/metrics/servers/${id}?minutes=${minutes}`);
          return { id, metrics: m };
        })
      );
      const newMap: Record<string, Metric[]> = {};
      for (const res of results) {
        newMap[res.id] = res.metrics;
      }
      setServerMetricsMap(newMap);
    } catch (err) {
      console.error("Metrics load error", err);
    } finally {
      setLoadingMetrics(false);
    }
  }

  useEffect(() => {
    loadOverview();
    const socket = getSocket();
    const onMetric = () => {
      loadOverview();
    };
    socket.on("metric", onMetric);
    return () => {
      socket.off("metric", onMetric);
    };
  }, []);

  useEffect(() => {
    loadComparisonMetrics(selectedServerIds, range);
  }, [selectedServerIds, range]);

  const toggleServerSelection = (id: string) => {
    setSelectedServerIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id);
      }
      if (prev.length >= 5) return prev; // max 5 for comparison clarity
      return [...prev, id];
    });
  };

  // Build merged timeline for recharts
  const timestampsSet = new Set<string>();
  Object.values(serverMetricsMap).forEach((list) => {
    list.forEach((m) => timestampsSet.add(m.recorded_at));
  });

  const sortedTimestamps = Array.from(timestampsSet).sort();

  const comparisonChartData = sortedTimestamps.map((ts) => {
    const timeLabel = new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    const row: Record<string, unknown> = { time: timeLabel, timestamp: ts };

    selectedServerIds.forEach((id) => {
      const serverList = serverMetricsMap[id] || [];
      const match = serverList.find((m) => m.recorded_at === ts);

      row[`${id}_cpu`] = match ? match.cpu_percent : null;
      row[`${id}_memory`] = match ? match.memory_percent : null;
      row[`${id}_disk_io`] = match ? Number(((match.disk_read_rate_mb ?? 0) + (match.disk_write_rate_mb ?? 0)).toFixed(2)) : null;
    });

    return row;
  });

  // Top resource consumers
  const topCpu = [...servers]
    .filter((s) => s.latest !== null)
    .sort((a, b) => (b.latest?.cpu_percent ?? 0) - (a.latest?.cpu_percent ?? 0))
    .slice(0, 5);

  const topMem = [...servers]
    .filter((s) => s.latest !== null)
    .sort((a, b) => (b.latest?.memory_percent ?? 0) - (a.latest?.memory_percent ?? 0))
    .slice(0, 5);

  const topDisk = [...servers]
    .filter((s) => s.latest !== null)
    .sort((a, b) => (b.latest?.disk_percent ?? 0) - (a.latest?.disk_percent ?? 0))
    .slice(0, 5);

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Telemetry Analytics</h1>
          <p className="text-sm text-slate-400">
            Multi-server comparative performance telemetry & resource usage leaderboards
          </p>
        </div>
        <div className="flex items-center gap-2">
          {RANGES.map((r) => (
            <Button
              key={r.minutes}
              variant={range === r.minutes ? "default" : "outline"}
              size="sm"
              onClick={() => setRange(r.minutes)}
              className={cn(
                range === r.minutes
                  ? "bg-emerald-600 text-white hover:bg-emerald-500"
                  : "border-slate-800 bg-slate-900 text-slate-400 hover:text-slate-200"
              )}
            >
              {r.label}
            </Button>
          ))}
        </div>
      </div>

      {error && <p className="text-sm text-red-400">{error}</p>}

      {/* Top Consumers Leaderboards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Top CPU */}
        <Card className="border-sky-500/30 bg-slate-900/90 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
              <Cpu className="h-4 w-4" /> Top CPU Load
            </CardTitle>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Real-time</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : topCpu.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No metrics reporting</p>
            ) : (
              topCpu.map((s, idx) => {
                const cpu = s.latest?.cpu_percent ?? 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/servers/${s.id}`)}
                    className="flex flex-col gap-1 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500 w-3">#{idx + 1}</span>
                        {s.name}
                      </span>
                      <span className="font-mono font-bold text-sky-400">{cpu.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-sky-500 to-indigo-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(cpu, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top Memory */}
        <Card className="border-purple-500/30 bg-slate-900/90 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
              <MemoryStick className="h-4 w-4" /> Top Memory Usage
            </CardTitle>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Real-time</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : topMem.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No metrics reporting</p>
            ) : (
              topMem.map((s, idx) => {
                const mem = s.latest?.memory_percent ?? 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/servers/${s.id}`)}
                    className="flex flex-col gap-1 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500 w-3">#{idx + 1}</span>
                        {s.name}
                      </span>
                      <span className="font-mono font-bold text-purple-400">{mem.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(mem, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>

        {/* Top Disk */}
        <Card className="border-amber-500/30 bg-slate-900/90 shadow-lg">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
              <HardDrive className="h-4 w-4" /> Top Disk Space
            </CardTitle>
            <span className="text-[10px] text-slate-500 uppercase tracking-widest">Real-time</span>
          </CardHeader>
          <CardContent className="flex flex-col gap-2.5">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)
            ) : topDisk.length === 0 ? (
              <p className="text-xs text-slate-500 py-4 text-center">No metrics reporting</p>
            ) : (
              topDisk.map((s, idx) => {
                const dsk = s.latest?.disk_percent ?? 0;
                return (
                  <div
                    key={s.id}
                    onClick={() => navigate(`/servers/${s.id}`)}
                    className="flex flex-col gap-1 p-2 rounded-lg hover:bg-slate-800/60 cursor-pointer transition-colors"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-slate-200 truncate flex items-center gap-1.5">
                        <span className="text-[10px] font-mono text-slate-500 w-3">#{idx + 1}</span>
                        {s.name}
                      </span>
                      <span className="font-mono font-bold text-amber-400">{dsk.toFixed(1)}%</span>
                    </div>
                    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-500 to-orange-500 rounded-full transition-all duration-300"
                        style={{ width: `${Math.min(dsk, 100)}%` }}
                      />
                    </div>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </div>

      {/* Multi-Server Comparison Panel */}
      <Card className="border-slate-800 shadow-xl bg-slate-900/80">
        <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800/80 pb-4">
          <div>
            <CardTitle className="text-base font-bold text-slate-100 flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-400" />
              Side-by-Side Server Comparison Workspace
            </CardTitle>
            <p className="text-xs text-slate-400 mt-0.5">
              Select 2 to 5 site servers to compare live load trends over time
            </p>
          </div>

          {/* Server Selector Pills */}
          <div className="flex flex-wrap items-center gap-2">
            {servers.map((s) => {
              const selected = selectedServerIds.includes(s.id);
              const color = PALETTE[selectedServerIds.indexOf(s.id) % PALETTE.length];
              return (
                <button
                  key={s.id}
                  onClick={() => toggleServerSelection(s.id)}
                  className={cn(
                    "flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium transition-all border",
                    selected
                      ? "bg-slate-800 text-slate-100 border-slate-600 shadow-sm"
                      : "bg-slate-950/60 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                  )}
                >
                  {selected ? (
                    <span
                      className="h-2.5 w-2.5 rounded-full"
                      style={{ backgroundColor: color }}
                    />
                  ) : (
                    <Square className="h-3.5 w-3.5 text-slate-600" />
                  )}
                  <span>{s.name}</span>
                </button>
              );
            })}
          </div>
        </CardHeader>

        <CardContent className="pt-6 flex flex-col gap-8">
          {selectedServerIds.length === 0 ? (
            <div className="py-16 text-center text-sm text-slate-500">
              Select at least one server above to generate comparison telemetry charts.
            </div>
          ) : loadingMetrics ? (
            <div className="py-16 flex flex-col items-center justify-center gap-2 text-slate-500">
              <Skeleton className="h-[280px] w-full" />
            </div>
          ) : (
            <>
              {/* CPU Comparison Chart */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-sky-400 flex items-center gap-1.5">
                    <Cpu className="h-4 w-4" /> Comparative CPU Load (%)
                  </h3>
                  <span className="text-xs text-slate-500">{range} minutes window</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={comparisonChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      domain={[0, (dataMax: number) => Math.min(100, Math.max(10, Math.ceil(dataMax * 1.15)))]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "12px" }} />
                    <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                    {selectedServerIds.map((id, idx) => {
                      const srv = servers.find((s) => s.id === id);
                      const key = `${id}_cpu`;
                      const color = PALETTE[idx % PALETTE.length];
                      return (
                        <Line
                          key={id}
                          type="monotone"
                          connectNulls={true}
                          dataKey={key}
                          name={srv ? `${srv.name} (${siteMap[srv.site_id]?.client || "Site"})` : id.slice(0, 6)}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* RAM Comparison Chart */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-purple-400 flex items-center gap-1.5">
                    <MemoryStick className="h-4 w-4" /> Comparative Memory Utilization (%)
                  </h3>
                  <span className="text-xs text-slate-500">{range} minutes window</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={comparisonChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      domain={[
                        (dataMin: number) => Math.max(0, Math.floor(dataMin - 2)),
                        (dataMax: number) => Math.min(100, Math.ceil(dataMax + 2)),
                      ]}
                      tickFormatter={(v) => `${v}%`}
                    />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "12px" }} />
                    <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                    {selectedServerIds.map((id, idx) => {
                      const srv = servers.find((s) => s.id === id);
                      const key = `${id}_memory`;
                      const color = PALETTE[idx % PALETTE.length];
                      return (
                        <Line
                          key={id}
                          type="monotone"
                          connectNulls={true}
                          dataKey={key}
                          name={srv ? `${srv.name} (${siteMap[srv.site_id]?.client || "Site"})` : id.slice(0, 6)}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>

              {/* Disk I/O Throughput Comparison */}
              <div>
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                    <HardDrive className="h-4 w-4" /> Comparative Disk I/O Throughput (MB/s)
                  </h3>
                  <span className="text-xs text-slate-500">Total Read + Write Rate</span>
                </div>
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={comparisonChartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                    <XAxis dataKey="time" stroke="#64748b" fontSize={11} />
                    <YAxis
                      stroke="#64748b"
                      fontSize={11}
                      domain={[0, (dataMax: number) => Math.max(1, Number((dataMax * 1.15).toFixed(1)))]}
                      tickFormatter={(v) => `${v} MB/s`}
                    />
                    <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: "12px" }} />
                    <Legend wrapperStyle={{ paddingTop: "10px", fontSize: "12px" }} />
                    {selectedServerIds.map((id, idx) => {
                      const srv = servers.find((s) => s.id === id);
                      const key = `${id}_disk_io`;
                      const color = PALETTE[idx % PALETTE.length];
                      return (
                        <Line
                          key={id}
                          type="monotone"
                          connectNulls={true}
                          dataKey={key}
                          name={srv ? `${srv.name}` : id.slice(0, 6)}
                          stroke={color}
                          strokeWidth={2.5}
                          dot={false}
                        />
                      );
                    })}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
