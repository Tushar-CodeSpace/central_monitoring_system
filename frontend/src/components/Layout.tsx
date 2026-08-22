import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/alerts", label: "Alerts", icon: Bell },
];

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen p-3">
      <aside
        className={cn(
          "sticky top-3 flex h-[calc(100vh-1.5rem)] shrink-0 flex-col overflow-hidden",
          "rounded-2xl border border-slate-800/80 bg-slate-900/70 shadow-2xl shadow-black/40 backdrop-blur-xl",
          "transition-[width] duration-300 ease-in-out",
          collapsed ? "w-[4.75rem]" : "w-60"
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex w-full shrink-0 items-center gap-2 px-4 pb-3 pt-5",
            collapsed && "justify-center px-0"
          )}
        >
          <div className="relative shrink-0" title="Central Monitor">
            <span className="absolute inset-0 rounded-lg bg-emerald-500/30 blur-md"></span>
            <Activity className="relative h-6 w-6 text-emerald-400" />
          </div>
          {!collapsed && (
            <span className="flex-1 truncate whitespace-nowrap font-semibold tracking-tight">
              Central<span className="text-emerald-400">Monitor</span>
            </span>
          )}
          {!collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-slate-500 hover:text-slate-200"
              onClick={() => setCollapsed(true)}
              title="Collapse sidebar"
            >
              <PanelLeftClose className="h-4 w-4" />
            </Button>
          )}
        </div>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" />

        {/* Nav */}
        <nav
          className={cn(
            "mt-3 flex w-full flex-col gap-1 px-2",
            collapsed && "items-center px-0"
          )}
        >
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-xl py-2 text-sm text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100",
                  collapsed ? "w-10 justify-center" : "px-3",
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
                      "h-4 w-4 shrink-0 transition-colors group-hover:text-emerald-400",
                      isActive && "text-emerald-400"
                    )}
                  />
                  {!collapsed && label}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div
          className={cn(
            "mt-auto mb-4 flex w-full flex-col gap-1 px-2",
            collapsed && "items-center px-0"
          )}
        >
          <div className="mx-2 mb-2 h-px bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" />
          {collapsed && (
            <Button
              variant="ghost"
              size="icon"
              className="mb-1 text-slate-400 hover:text-slate-100"
              onClick={() => setCollapsed(false)}
              title="Expand sidebar"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </Button>
          )}
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
            <LogOut className="h-4 w-4 shrink-0 transition-colors hover:text-red-400" />
            {!collapsed && "Logout"}
          </Button>
        </div>
      </aside>

      <main className="min-w-0 flex-1 p-3 pl-4">{children}</main>
    </div>
  );
}
