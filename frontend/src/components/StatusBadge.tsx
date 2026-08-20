import { Server } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

const dot = "h-1.5 w-1.5 rounded-full";

export function StatusBadge({ status }: { status: Server["status"] }) {
  const map: Record<
    Server["status"],
    { label: string; variant: "green" | "yellow" | "red" | "slate"; dotClass: string; glow: string }
  > = {
    online: {
      label: "Online",
      variant: "green",
      dotClass: "bg-emerald-400",
      glow: "shadow-[0_0_8px_rgba(52,211,153,0.9)]",
    },
    warning: {
      label: "Warning",
      variant: "yellow",
      dotClass: "bg-amber-400",
      glow: "shadow-[0_0_8px_rgba(251,191,36,0.9)]",
    },
    offline: {
      label: "Offline",
      variant: "red",
      dotClass: "bg-red-400",
      glow: "shadow-[0_0_8px_rgba(248,113,113,0.9)]",
    },
    unknown: { label: "Unknown", variant: "slate", dotClass: "bg-slate-400", glow: "" },
  };
  const { label, variant, dotClass, glow } = map[status] ?? map.unknown;
  return (
    <Badge variant={variant}>
      <span className={dotClass + " " + dot + " " + glow} />
      {label}
    </Badge>
  );
}

export function ServiceBadge({ status }: { status: string }) {
  const variant =
    status === "running" ? "green" : status === "stopped" ? "red" : status === "error" ? "red" : "slate";
  return <Badge variant={variant as "green" | "red" | "slate"}>{status}</Badge>;
}

export function SeverityBadge({ severity }: { severity: string }) {
  const variant =
    severity === "critical" ? "red" : severity === "warning" ? "yellow" : "blue";
  return <Badge variant={variant as "red" | "yellow" | "blue"}>{severity}</Badge>;
}