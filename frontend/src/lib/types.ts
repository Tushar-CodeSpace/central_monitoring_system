export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface Site {
  id: string;
  client: string;
  code: string;
  location: string;
  status: string;
  created_at: string;
  updated_at: string;
}

export interface Server {
  id: string;
  site_id: string;
  name: string;
  hostname: string;
  ip_address: string | null;
  status: "online" | "warning" | "offline" | "unknown";
  last_seen_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Metric {
  id: string;
  server_id: string;
  timestamp: string;
  cpu_percent: number;
  memory_percent: number;
  memory_total: number;
  memory_available: number;
  disk_percent: number;
  disk_total: number;
  disk_free: number;
  network_bytes_sent: number;
  network_bytes_received: number;
  uptime_seconds: number;
  recorded_at: string;
}

export interface Service {
  id: string;
  server_id: string;
  name: string;
  status: "running" | "stopped" | "unknown";
  port: number | null;
  last_checked_at: string;
}

export interface Alert {
  id: string;
  server_id: string;
  type: string;
  severity: "info" | "warning" | "critical";
  message: string;
  value: number | null;
  threshold: number | null;
  status: "active" | "resolved";
  created_at: string;
  resolved_at: string | null;
}

export interface ApiKey {
  id: string;
  server_id: string;
  name: string;
  status: "active" | "revoked";
  created_at: string;
  last_used_at: string | null;
}

export interface LatestMetric {
  recorded_at: string;
  cpu_percent: number;
  memory_percent: number;
  memory_total: number;
  memory_available: number;
  disk_percent: number;
  disk_total: number;
  disk_free: number;
  network_bytes_sent: number;
  network_bytes_received: number;
  uptime_seconds: number;
}

export interface AlertConfig {
  ram_threshold_percent: number;
  cpu_threshold_percent: number;
  cpu_duration_seconds: number;
  disk_threshold_percent: number;
  config_sync_enabled: boolean;
  config_sync_interval_seconds: number;
}

export interface ConfigSnapshotMeta {
  id: string;
  server_id: string;
  database: string;
  collection: string;
  captured_at: string;
  received_at: string;
  count: number;
  content_hash: string;
  truncated: boolean;
}

export interface ConfigSnapshotFull extends ConfigSnapshotMeta {
  documents: Record<string, unknown>[];
}