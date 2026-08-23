import { useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Activity,
  Bell,
  LayoutDashboard,
  LogOut,
  Menu,
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

function Clock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="hidden font-mono text-xs tabular-nums text-slate-400 sm:block">
      {now.toLocaleTimeString([], { hour12: false })}
    </span>
  );
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [pinned, setPinned] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches
  );
  const expanded = pinned || hovered;
  // Inside the drawer (mobile) labels are always shown; desktop keeps rail/pin logic.
  const wide = expanded || isMobile;

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 1023px)");
    const onChange = (e: MediaQueryListEvent) => {
      setIsMobile(e.matches);
      if (!e.matches) setMobileOpen(false);
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const pageTitle =
    location.pathname.startsWith("/servers/")
      ? "Server details"
      : (nav.find((n) => n.to === location.pathname)?.label ?? "Dashboard");

  return (
    <div className="flex min-h-screen">
      {/* Mobile backdrop */}
      {isMobile && mobileOpen && (
        <div
          className="fixed inset-0 z-[85] bg-black/60 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        onMouseEnter={() => !isMobile && setHovered(true)}
        onMouseLeave={() => !isMobile && setHovered(false)}
        className={cn(
          "flex shrink-0 flex-col overflow-hidden bg-slate-900/95 shadow-2xl backdrop-blur-xl",
          "border-slate-800/80 transition-[transform,width,box-shadow] duration-300 ease-in-out",
          isMobile
            ? cn(
                "fixed inset-y-0 left-0 z-[90] w-64",
                mobileOpen ? "translate-x-0 shadow-black/70" : "-translate-x-full"
              )
            : cn("fixed left-3 top-3 h-[calc(100vh-1.5rem)] rounded-2xl border", expanded ? "w-60 shadow-black/60" : "w-[4.75rem] shadow-black/40")
        )}
      >
        {/* Brand */}
        <div
          className={cn(
            "flex w-full shrink-0 items-center gap-2 px-4 pb-3 pt-5",
            !expanded && !isMobile && "justify-center px-0",
            isMobile && "pt-6"
          )}
        >
          <button
            className="relative shrink-0 cursor-pointer"
            title={expanded && !isMobile ? undefined : "Open menu"}
            onClick={() => {
              if (isMobile) {
                setMobileOpen(false);
              } else if (!expanded) {
                setPinned(true);
              }
              navigate("/");
            }}
          >
            <span className="absolute inset-0 rounded-lg bg-emerald-500/30 blur-md"></span>
            <Activity className="relative h-6 w-6 text-emerald-400" />
          </button>
          {wide && (
            <>
              <span className="flex-1 truncate whitespace-nowrap font-semibold tracking-tight">
                Central<span className="text-emerald-400">Monitor</span>
              </span>
              {!isMobile && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-slate-500 hover:text-slate-200"
                  onClick={() => setPinned(false)}
                  title="Collapse to hover rail"
                >
                  <PanelLeftClose className="h-4 w-4" />
                </Button>
              )}
            </>
          )}
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
              onClick={() => isMobile && setMobileOpen(false)}
              className={({ isActive }) =>
                cn(
                  "group relative flex items-center gap-2.5 rounded-xl py-2 text-sm text-slate-400 transition-all hover:bg-slate-800/70 hover:text-slate-100",
                  wide ? "w-full px-3" : "w-10 justify-center",
                  isActive &&
                    "bg-gradient-to-r from-emerald-500/15 to-transparent text-emerald-300 hover:text-emerald-300"
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && wide && (
                    <span className="absolute left-0 top-1/2 h-5 w-0.5 -translate-y-1/2 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.9)]"></span>
                  )}
                  <Icon
                    className={cn(
                      "h-4 w-4 shrink-0 transition-colors group-hover:text-emerald-400",
                      isActive && "text-emerald-400"
                    )}
                  />
                  {wide && <span className="whitespace-nowrap">{label}</span>}
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
            size={wide ? "sm" : "icon"}
            className={cn("text-slate-400", wide && "w-full justify-start")}
            onClick={() => {
              if (isMobile) setMobileOpen(false);
              setToken(null);
              navigate("/login");
            }}
            title="Logout"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {wide && "Logout"}
          </Button>
        </div>
      </aside>

      {/* Desktop rail spacer (mobile uses the drawer) */}
      <div className={cn("hidden h-screen shrink-0 lg:block", pinned ? "w-[268px]" : "w-[116px]")} />

      <main className="flex min-w-0 flex-1 flex-col py-3 pr-3">
        {/* Top navbar header */}
        <header className="sticky top-0 z-30 mb-5 flex h-14 shrink-0 items-center gap-2 rounded-2xl border border-slate-800/80 bg-gradient-to-r from-slate-900/90 via-slate-900/70 to-slate-900/40 px-3 shadow-lg shadow-black/30 backdrop-blur-xl sm:gap-3 sm:px-4">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-slate-300 hover:text-white lg:hidden"
            onClick={() => setMobileOpen(true)}
            title="Open menu"
          >
            <Menu className="h-5 w-5" />
          </Button>
          <div className="hidden h-8 w-8 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 sm:flex">
            <LayoutDashboard className="h-4 w-4 text-emerald-400" />
          </div>
          <h2 className="min-w-0 flex-1 truncate text-sm font-semibold tracking-tight text-slate-100">
            {pageTitle}
          </h2>

          {/* Right cluster — bell stays pinned to the far right on every screen size */}
          <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
            <span className="hidden items-center gap-2 text-xs text-slate-400 sm:flex">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500"></span>
              </span>
              Live
            </span>
            <Clock />
            <div className="hidden h-6 w-px bg-slate-700/70 sm:block" />
            <NotificationBell />
          </div>
        </header>
        {children}
      </main>
      <ToastHost />
    </div>
  );
}
