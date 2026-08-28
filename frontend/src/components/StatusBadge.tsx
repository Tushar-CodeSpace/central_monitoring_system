import { Server } from "@/lib/types";
import { Badge } from "@/components/ui/badge";

export function StatusBadge({ status }: { status: Server["status"] }) {
  const map: Record<
    Server["status"],
    { label: string; variant: "green" | "yellow" | "red" | "slate"; dotClass: string; pingClass: string }
  > = {
    online: {
      label: "Online",
      variant: "green",
      dotClass: "bg-emerald-400",
      pingClass: "bg-emerald-400",
    },
    warning: {
      label: "Warning",
      variant: "yellow",
      dotClass: "bg-amber-400",
      pingClass: "bg-amber-400",
    },
    offline: {
      label: "Offline",
      variant: "red",
      dotClass: "bg-red-400",
      pingClass: "bg-red-400",
    },
    unknown: {
      label: "Unknown",
      variant: "slate",
      dotClass: "bg-slate-400",
      pingClass: "",
    },
  };
  const { label, variant, dotClass, pingClass } = map[status] ?? map.unknown;
  return (
    <Badge variant={variant}>
      <span className="relative flex h-2 w-2 shrink-0">
        {pingClass && (
          <span className={`absolute inline-flex h-full w-full animate-ping rounded-full opacity-75 ${pingClass}`} />
        )}
        <span className={`relative inline-flex h-2 w-2 rounded-full ${dotClass}`} />
      </span>
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