import { cn } from "@/lib/utils";
import { statusLabels, statusColors, type ThesisStatus } from "@/lib/mock-data";

interface StatusBadgeProps {
  status: ThesisStatus;
}

const colorClasses: Record<string, string> = {
  info: "bg-info/15 text-info",
  warning: "bg-warning/15 text-warning",
  accent: "bg-accent/15 text-accent-foreground",
  destructive: "bg-destructive/15 text-destructive",
  success: "bg-success/15 text-success",
};

export default function StatusBadge({ status }: StatusBadgeProps) {
  const colorKey = statusColors[status];
  return (
    <span className={cn("status-badge", colorClasses[colorKey])}>
      <span
        className={cn(
          "w-1.5 h-1.5 rounded-full",
          colorKey === "success" && "bg-success",
          colorKey === "warning" && "bg-warning",
          colorKey === "info" && "bg-info",
          colorKey === "destructive" && "bg-destructive",
          colorKey === "accent" && "bg-accent"
        )}
      />
      {statusLabels[status]}
    </span>
  );
}
