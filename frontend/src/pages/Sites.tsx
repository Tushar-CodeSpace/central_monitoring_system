import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import type { Server } from "@/lib/types";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function Sites() {
  const [sites, setSites] = useState<Site[]>([]);
  const [servers, setServers] = useState<Server[]>([]);
  const [client, setClient] = useState("");
  const [code, setCode] = useState("");
  const [location, setLocation] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  async function load() {
    try {
      const s = await apiFetch<any[]>("/sites");
      const sv = await apiFetch<Server[]>("/servers");
      setSites(s);
      setServers(sv);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }
  useEffect(() => {
    load();
  }, []);

  async function createSite(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    try {
      await apiFetch("/sites", {
        method: "POST",
        body: JSON.stringify({ client, code, location, status: "active" }),
      });
      setInfo(`Site ${code} created.`);
      setClient(""); setCode(""); setLocation("");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Create failed");
    }
  }

  async function deleteSite(id: string) {
    try {
      await apiFetch(`/sites/${id}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Sites</h1>
        <p className="text-sm text-slate-400">Client locations (conveyors, warehouses, etc.)</p>
      </div>
      {error && <p className="text-sm text-red-400">{error}</p>}
      {info && <p className="text-sm text-emerald-400">{info}</p>}

      <Card>
        <CardHeader><CardTitle className="text-sm">New site</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={createSite} className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Client
              <input className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3" value={client} onChange={(e) => setClient(e.target.value)} required />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Code (a-z0-9_)
              <input className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3" value={code} onChange={(e) => setCode(e.target.value)} required pattern="[a-z0-9_]+" />
            </label>
            <label className="flex flex-col gap-1 text-xs text-slate-400">
              Location
              <input className="h-9 rounded-md border border-slate-700 bg-slate-950 px-3" value={location} onChange={(e) => setLocation(e.target.value)} required />
            </label>
            <Button type="submit" size="sm">Create</Button>
          </form>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-3">
        {sites.map((site) => (
          <Card key={site.id}>
            <CardHeader className="flex-row items-center justify-between">
              <div>
                <CardTitle>{site.client}</CardTitle>
                <p className="text-xs text-slate-400">{site.code} · {site.location}</p>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-slate-400">{servers.filter((s) => s.site_id === site.id).length} servers</span>
                <Button variant="destructive" size="sm" onClick={() => deleteSite(site.id)}>Delete</Button>
              </div>
            </CardHeader>
          </Card>
        ))}
      </div>
    </div>
  );
}

interface Site {
  id: string;
  client: string;
  code: string;
  location: string;
  status: string;
}