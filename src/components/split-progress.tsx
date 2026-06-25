import { cn } from "@/lib/utils";

interface SplitProgressProps {
  total: number;
  ok: number;
  missing: number;
  className?: string;
}

/**
 * Barra de progresso dividida:
 * - verde: itens conferidos (OK)
 * - vermelho: itens marcados como faltando
 * - restante (cinza): ainda pendentes
 */
export function SplitProgress({ total, ok, missing, className }: SplitProgressProps) {
  const pctOk = total > 0 ? (ok / total) * 100 : 0;
  const pctMiss = total > 0 ? (missing / total) * 100 : 0;
  return (
    <div
      className={cn(
        "flex h-2 w-full overflow-hidden rounded-full bg-muted",
        className,
      )}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={total}
      aria-valuenow={ok + missing}
    >
      <div
        className="h-full bg-success transition-all"
        style={{ width: `${pctOk}%` }}
      />
      <div
        className="h-full bg-destructive transition-all"
        style={{ width: `${pctMiss}%` }}
      />
    </div>
  );
}
