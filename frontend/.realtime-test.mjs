import { io } from "socket.io-client";

const BASE = "http://localhost:8000";
const serverId = "6a872899fbe76c1e1f4ad991";

const login = await fetch(`${BASE}/api/v1/auth/login`, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ email: "admin@monitoring.com", password: "admin123" }),
});
const { access_token } = await login.json();

const s = io(BASE, { auth: { token: access_token }, transports: ["websocket"] });
s.on("connect", () => {
  console.log("CONNECTED", s.id);
  s.emit("join", serverId);
});
s.on("connect_error", (err) => { console.log("CONNECT_ERROR:", err.message); process.exit(1); });
s.on("metric", (m) => {
  console.log("METRIC_EVENT cpu=" + m.cpu_percent + " mem=" + m.memory_percent);
  s.disconnect();
  testBadToken();
});

setTimeout(async () => {
  await fetch(`${BASE}/api/v1/metrics`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-API-Key": "demo-lLmoWXH-kqK33LTZnqsI8kCow8Y82s7e" },
    body: JSON.stringify({
      server_id: serverId,
      timestamp: new Date().toISOString(),
      cpu_percent: 41.7, memory_percent: 58.3, memory_total: 4096000000, memory_available: 1700000000,
      disk_percent: 44.1, disk_total: 100000000000, disk_free: 55800000000,
      network_bytes_sent: 1000, network_bytes_received: 2000, uptime_seconds: 98765,
    }),
  });
}, 800);

function testBadToken() {
  const bad = io(BASE, { auth: { token: "garbage-token" }, transports: ["websocket"] });
  let failed = false;
  bad.on("connect", () => { console.log("BAD TOKEN: UNEXPECTED CONNECT"); process.exit(1); });
  bad.on("connect_error", () => { console.log("BAD TOKEN REJECTED OK"); failed = true; bad.close(); process.exit(0); });
  setTimeout(() => { if (!failed) { console.log("BAD TOKEN: NO ERROR (timeout)"); process.exit(1); } }, 5000);
}

setTimeout(() => { console.log("TIMEOUT: no metric event"); process.exit(1); }, 15000);