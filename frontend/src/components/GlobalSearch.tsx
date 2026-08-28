import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Search, Server as ServerIcon, Building2, MapPin, AlertTriangle, ArrowRight, X } from "lucide-react";
import { apiFetch } from "@/lib/api";
import type { Server, Site, Alert } from "@/lib/types";
import { StatusBadge, SeverityBadge } from "@/components/StatusBadge";
import { cn } from "@/lib/utils";

interface GlobalSearchProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GlobalSearch({ open, onOpenChange }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [servers, setServers] = useState<Server[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setSelectedIndex(0);
      setLoading(true);
      Promise.all([
        apiFetch<Server[]>("/servers"),
        apiFetch<Site[]>("/sites"),
        apiFetch<Alert[]>("/alerts?status=active"),
      ])
        .then(([sv, st, al]) => {
          setServers(sv);
          setSites(st);
          setAlerts(al);
        })
        .catch(() => {})
        .finally(() => setLoading(false));

      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const siteMap = Object.fromEntries(sites.map((s) => [s.id, s]));

  const q = query.trim().toLowerCase();

  const matchingServers = q
    ? servers.filter((s) => {
        const site = siteMap[s.site_id];
        return (
          s.name.toLowerCase().includes(q) ||
          s.hostname.toLowerCase().includes(q) ||
          (s.ip_address && s.ip_address.toLowerCase().includes(q)) ||
          (site && (site.client.toLowerCase().includes(q) || site.location.toLowerCase().includes(q)))
        );
      })
    : servers.slice(0, 5);

  const matchingAlerts = q
    ? alerts.filter((a) => a.message.toLowerCase().includes(q) || a.type.toLowerCase().includes(q))
    : [];

  const results = [
    ...matchingServers.map((s) => ({ type: "server" as const, item: s })),
    ...matchingAlerts.map((a) => ({ type: "alert" as const, item: a })),
  ];

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev < results.length - 1 ? prev + 1 : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => (prev > 0 ? prev - 1 : results.length - 1));
    } else if (e.key === "Enter" && results[selectedIndex]) {
      e.preventDefault();
      selectItem(results[selectedIndex]);
    } else if (e.key === "Escape") {
      onOpenChange(false);
    }
  };

  const selectItem = (res: (typeof results)[0]) => {
    onOpenChange(false);
    if (res.type === "server") {
      navigate(`/servers/${res.item.id}`);
    } else if (res.type === "alert") {
      navigate(`/alerts`);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-16 sm:pt-24 bg-black/70 backdrop-blur-md p-4 animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl rounded-2xl border border-slate-700/80 bg-slate-900/95 shadow-2xl shadow-emerald-500/5 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-800 bg-slate-950/40">
          <Search className="h-5 w-5 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            className="flex-1 bg-transparent text-sm text-slate-100 placeholder-slate-500 outline-none font-medium"
            placeholder="Search site servers by client, location, server name, IP, or alerts..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          {query && (
            <button
              onClick={() => setQuery("")}
              className="text-slate-500 hover:text-slate-300 p-1 rounded-md"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <span className="hidden sm:inline-flex items-center gap-1 rounded border border-slate-700 bg-slate-800/80 px-1.5 py-0.5 text-[10px] font-mono text-slate-400">
            ESC
          </span>
        </div>

        {/* Results Container */}
        <div className="max-h-[60vh] overflow-y-auto p-2">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-500">Loading site server registry...</div>
          ) : results.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              No site servers or alerts matched "<span className="text-slate-300">{query}</span>"
            </div>
          ) : (
            <div className="flex flex-col gap-1">
              {results.map((res, idx) => {
                const isSelected = idx === selectedIndex;
                if (res.type === "server") {
                  const s = res.item;
                  const site = siteMap[s.site_id];
                  return (
                    <button
                      key={`srv-${s.id}`}
                      onClick={() => selectItem(res)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "flex items-center justify-between w-full p-3 rounded-xl text-left transition-all duration-150",
                        isSelected
                          ? "bg-emerald-500/15 border border-emerald-500/40 text-slate-100 shadow-md shadow-emerald-500/5"
                          : "hover:bg-slate-800/60 border border-transparent text-slate-300"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "p-2 rounded-lg border shrink-0",
                            isSelected
                              ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                              : "bg-slate-800/80 border-slate-700/60 text-slate-400"
                          )}
                        >
                          <ServerIcon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-sm truncate">{s.name}</span>
                            <StatusBadge status={s.status} />
                          </div>
                          <div className="flex items-center gap-2 text-xs text-slate-400 truncate mt-0.5">
                            {site && (
                              <>
                                <span className="inline-flex items-center gap-1 text-slate-300">
                                  <Building2 className="h-3 w-3 text-slate-500" />
                                  {site.client}
                                </span>
                                <span>·</span>
                                <span className="inline-flex items-center gap-1 text-slate-400">
                                  <MapPin className="h-3 w-3 text-slate-500" />
                                  {site.location}
                                </span>
                                <span>·</span>
                              </>
                            )}
                            <span className="font-mono text-slate-400">{s.hostname}</span>
                            {s.ip_address && (
                              <>
                                <span>·</span>
                                <span className="font-mono text-emerald-400/90">{s.ip_address}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <ArrowRight
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200",
                          isSelected ? "text-emerald-400 translate-x-0.5" : "text-slate-600 opacity-0"
                        )}
                      />
                    </button>
                  );
                } else {
                  const a = res.item;
                  return (
                    <button
                      key={`alt-${a.id}`}
                      onClick={() => selectItem(res)}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={cn(
                        "flex items-center justify-between w-full p-3 rounded-xl text-left transition-all duration-150",
                        isSelected
                          ? "bg-sky-500/15 border border-sky-500/40 text-slate-100 shadow-md shadow-sky-500/5"
                          : "hover:bg-slate-800/60 border border-transparent text-slate-300"
                      )}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={cn(
                            "p-2 rounded-lg border shrink-0",
                            isSelected
                              ? "bg-sky-500/20 border-sky-500/50 text-sky-400"
                              : "bg-slate-800/80 border-slate-700/60 text-slate-400"
                          )}
                        >
                          <AlertTriangle className="h-4 w-4 text-amber-400" />
                        </div>
                        <div className="min-w-0 flex flex-col">
                          <div className="flex items-center gap-2">
                            <span className="font-medium text-sm truncate">{a.message}</span>
                            <SeverityBadge severity={a.severity} />
                          </div>
                          <span className="text-xs text-slate-500 mt-0.5">
                            Incident log · {a.type}
                          </span>
                        </div>
                      </div>
                      <ArrowRight
                        className={cn(
                          "h-4 w-4 shrink-0 transition-transform duration-200",
                          isSelected ? "text-sky-400 translate-x-0.5" : "text-slate-600 opacity-0"
                        )}
                      />
                    </button>
                  );
                }
              })}
            </div>
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between px-4 py-2.5 border-t border-slate-800/80 bg-slate-950/80 text-[11px] text-slate-500">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-300">↑</kbd>{" "}
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-300">↓</kbd> to navigate
            </span>
            <span>
              <kbd className="rounded border border-slate-700 bg-slate-800 px-1 py-0.5 text-slate-300">↵</kbd> to select
            </span>
          </div>
          <span>Site Servers Registry</span>
        </div>
      </div>
    </div>
  );
}
