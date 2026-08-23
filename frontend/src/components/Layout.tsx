import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  LayoutDashboard,
  LogOut,
  PanelLeftClose,
  Settings as SettingsIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { setToken } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ToastHost } from "@/components/ToastHost";
import { NotificationBell } from "@/components/NotificationBell";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/alerts", label: "Alert logs", icon: Bell },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

/**
 * Floating sidebar. Collapses to an icon rail; expands on hover (overlaying
 * content without reflow). Clicking the expand button pins it open until
 * closed again.
 */
export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const expanded = pinned || hovered;

  return (
    <div className="flex min-h-screen">
      <aside
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          "fixed left-3 top-3 z-40 flex h-[calc(100vh-1.5rem)] flex-col overflow-hidden",
          "rounded-2xl border border-slate-800/80 bg-slate-900/70 shadow-2xl backdrop-blur-xl",
          "transition-[width,box-shadow] duration-300 ease-in-out",
          expanded ? "w-60 shadow-black/60" : "w-[4.75rem] shadow-black/40"
        )}
      >
        {/* Brand + notifications */}
        <div
          className={cn(
            "flex w-full shrink-0 items-center gap-2 px-4 pb-3 pt-5",
            !expanded ? "flex-col justify-center gap-1 px-0" : ""
          )}
        >
          <button
            className="relative shrink-0 cursor-pointer"
            title={expanded ? undefined : "Expand sidebar"}
            onClick={() => {
              if (!expanded) setPinned(true);
              navigate("/");
            }}
          >
            <span className="absolute inset-0 rounded-lg bg-emerald-500/30 blur-md"></span>
            <Activity className="relative h-6 w-6 text-emerald-400" />
          </button>
          {expanded && (
            <>
              <span className="flex-1 truncate whitespace-nowrap font-semibold tracking-tight">
                Central<span className="text-emerald-400">Monitor</span>
              </span>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-slate-500 hover:text-slate-200"
                onClick={() => setPinned(false)}
                title="Collapse to hover rail"
              >
                <PanelLeftClose className="h-4 w-4" />
              </Button>
            </>
          )}
          <NotificationBell />
        </div>

        <div className="mx-4 h-px bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" />

        {/* Nav */}
        <nav className="mt-3 flex w-full flex-col items-center gap-1 px-2">
          {nav.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              title={label}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-xl py-2 text-sm text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100",
                  expanded ? "w-full px-3" : "w-10 justify-center",
                  isActive &&
                    "bg-gradient-to-r from-emerald-500/15 to-transparent text-emerald-300 hover:text-emerald-300"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && expanded && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"></span>
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors group-hover:text-emerald-400",
                      isActive && "text-emerald-400"
                    )}
                  />
                  {expanded && <span className="whitespace-nowrap">{label}</span>}
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Footer */}
        <div className="mb-4 mt-auto flex w-full flex-col items-center gap-1 px-2">
          <div className="mx-2 mb-2 h-px bg-gradient-to-r from-transparent via-slate-700/60 to-transparent" />
          <Button
            variant="ghost"
            size={expanded ? "sm" : "icon"}
            className={cn("text-slate-400", expanded && "w-full justify-start")}
            onClick={() => {
              setToken(null);
              navigate("/login");
            }}
            title="Logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {expanded && "Logout"}
          </Button>
        </div>
      </aside>

      {/* Rail spacer: reserves the collapsed width so expanding overlays content */}
      <div className={cn("h-screen shrink-0", pinned ? "w-[268px]" : "w-[116px]")} />

      <main className="min-w-0 flex-1 py-3 pr-3">{children}</main>
      <ToastHost />
    </div>
  );
}
