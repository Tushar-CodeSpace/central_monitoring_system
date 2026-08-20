import { Navigate, Route, Routes } from "react-router-dom";
import { getToken } from "@/lib/api";
import Layout from "@/components/Layout";
import Login from "@/pages/Login";
import Dashboard from "@/pages/Dashboard";
import ServerDetail from "@/pages/ServerDetail";
import Sites from "@/pages/Sites";
import Alerts from "@/pages/Alerts";

function Protected({ children }: { children: React.ReactNode }) {
  if (!getToken()) return <Navigate to="/login" replace />;
  return <Layout>{children}</Layout>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Protected><Dashboard /></Protected>} />
      <Route path="/sites" element={<Protected><Sites /></Protected>} />
      <Route path="/servers/:id" element={<Protected><ServerDetail /></Protected>} />
      <Route path="/alerts" element={<Protected><Alerts /></Protected>} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}