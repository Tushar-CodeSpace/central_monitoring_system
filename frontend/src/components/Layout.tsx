import { useState } from "react";
import { Activity } from "lucide-react";
import { NavLink, useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Bell, ChevronLeft, ChevronRight, LayoutDashboard, LogOut } from "lucide-react";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "flex shrink-0 flex-col border-r border-slate-800/70 bg-slate-900/70 p-4 backdrop-blur transition-[width] duration-200",
          collapsed ? "w-16" : "w-56"
        )}
      >
        <div className={cn("flex items-center pb-6", collapsed ? "justify-center" : "gap-2 px-2")}>
          <div className="relative shrink-0">
            <span className="absolute inset-0 rounded-lg bg-emerald-500/30 blur-md"></span>
            <Activity className="relative h-6 w-6 text-emerald-400" />
          </div>
          {!collapsed && (
            <span className="whitespace-nowrap font-semibold tracking-tight">
              Central<span className="text-emerald-400">Monitor</span>
            </span>
          )}
        </div>

        <nav className="flex flex-col gap-1">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={collapsed ? label : undefined}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2 rounded-lg px-3 py-2 text-sm text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100",
                  collapsed && "justify-center px-0",
                  isActive &&
                    "bg-gradient-to-r from-emerald-500/15 to-transparent text-emerald-300 hover:text-emerald-300"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && !collapsed && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"></span>
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors",
                      isActive && "text-emerald-400"
                    )}
                  />
                  {!collapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-1 pt-6">
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn("text-slate-400", !collapsed && "w-full justify-start")}
            onClick={() => setCollapsed((c) => !c)}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="h-4 w-4" />
            ) : (
              <ChevronLeft className="h-4 w-4" />
            )}
            {!collapsed && "Collapse"}
          </Button>
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "sm"}
            className={cn("text-slate-400", !collapsed && "w-full justify-start")}
            onClick={() => {
              setToken(null);
              navigate("/login");
            }}
            title="Logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && "Logout"}
          </Button>
        </div>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}