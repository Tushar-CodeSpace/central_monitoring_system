import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "@/lib/api";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ServerDetail from "@/pages/ServerDetail";
import Analytics from "@/pages/Analytics";
import Alerts from "@/pages/Alerts";
import SettingsPage from "@/pages/Settings";
import UsersPage from "@/pages/Users";
import AuditLogsPage from "@/pages/AuditLogs";
import WhatsAppPage from "@/pages/WhatsApp";

import { ThemeProvider } from "@/lib/theme";

function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <ThemeProvider>
      <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/servers/:id" element={<Protected><ServerDetail /></Protected>} />
      <Route path="/analytics" element={<Protected><Analytics /></Protected>} />
      <Route path="/alerts" element={<Protected><Alerts /></Protected>} />
      <Route path="/settings" element={<Protected><SettingsPage /></Protected>} />
      <Route path="/users" element={<Protected><UsersPage /></Protected>} />
      <Route path="/audit-logs" element={<Protected><AuditLogsPage /></Protected>} />
      <Route path="/whatsapp" element={<Protected><WhatsAppPage /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  </ThemeProvider>
  );
}