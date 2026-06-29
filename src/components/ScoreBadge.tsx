import { cn } from "@/lib/utils";

export function ScoreBadge({ score, className }: { score: number | null | undefined; className?: string }) {
  if (score == null) return <span className="text-xs text-muted-foreground">—</span>;
  const s = Math.round(Number(score));
  const tone =
    s >= 75
      ? "bg-[color:var(--success)] text-[color:var(--success-foreground)]"
      : s >= 50
        ? "bg-[color:var(--warning)] text-[color:var(--warning-foreground)]"
        : "bg-destructive text-destructive-foreground";
  return (
    <span className={cn("inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold", tone, className)}>
      {s}%
    </span>
  );
}
