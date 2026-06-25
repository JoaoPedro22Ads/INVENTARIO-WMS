import { useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  AlertTriangle, Building2, Layers, MapPin, Package, Truck, Users, Clock, TrendingUp, Warehouse, Boxes,
} from "lucide-react";

export interface MapItem {
  inventory_id: string;
  cliente: string;
  tipo: string | null;
  endereco: string | null;
  area: string | null;
  saldo_vol: number | null;
  nota_fiscal: string | null;
  entrada: string | null;
}

interface Props {
  latestItems: MapItem[];
  allItems: MapItem[];
}

type AreaKey =
  | "QUADRA 1" | "QUADRA 2" | "QUADRA 3" | "QUADRA 4"
  | "QUADRA 5" | "QUADRA 6" | "QUADRA 7" | "QUADRA 8"
  | "G4" | "G3" | "PÁTIO" | "AVARIA";

const AREAS: AreaKey[] = [
  "QUADRA 1", "QUADRA 2", "QUADRA 3", "QUADRA 4",
  "QUADRA 5", "QUADRA 6", "QUADRA 7", "QUADRA 8",
  "G4", "G3", "PÁTIO", "AVARIA",
];

// Floor-plan layout on a 12-col × 10-row grid (top-down view).
const LAYOUT: Record<AreaKey, { col: [number, number]; row: [number, number]; short: string; icon: "warehouse" | "quadra" | "patio" | "avaria" }> = {
  "G4":        { col: [1, 7],   row: [1, 6],  short: "G4",     icon: "warehouse" },
  "G3":        { col: [1, 7],   row: [6, 10], short: "G3",     icon: "warehouse" },
  "QUADRA 1":  { col: [7, 9],   row: [1, 3],  short: "Q1",     icon: "quadra" },
  "QUADRA 2":  { col: [9, 11],  row: [1, 3],  short: "Q2",     icon: "quadra" },
  "QUADRA 3":  { col: [11, 13], row: [1, 3],  short: "Q3",     icon: "quadra" },
  "QUADRA 4":  { col: [7, 9],   row: [3, 5],  short: "Q4",     icon: "quadra" },
  "QUADRA 5":  { col: [9, 11],  row: [3, 5],  short: "Q5",     icon: "quadra" },
  "QUADRA 6":  { col: [11, 13], row: [3, 5],  short: "Q6",     icon: "quadra" },
  "QUADRA 7":  { col: [7, 10],  row: [5, 7],  short: "Q7",     icon: "quadra" },
  "QUADRA 8":  { col: [10, 13], row: [5, 7],  short: "Q8",     icon: "quadra" },
  "PÁTIO":     { col: [7, 11],  row: [7, 10], short: "PÁTIO",  icon: "patio" },
  "AVARIA":    { col: [11, 13], row: [7, 10], short: "AVARIA", icon: "avaria" },
};

function normalize(s: string | null | undefined) {
  return (s ?? "").toUpperCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

function classifyArea(it: MapItem): AreaKey | null {
  const end = normalize(it.endereco);
  const area = normalize(it.area);
  const blob = `${end} ${area}`;
  if (/\bAVARIA/.test(blob)) return "AVARIA";
  const q = end.match(/QUADRA\s*0*(\d+)/);
  if (q) {
    const n = Number(q[1]);
    if (n >= 1 && n <= 8) return `QUADRA ${n}` as AreaKey;
  }
  if (/\bPATIO/.test(blob)) return "PÁTIO";
  const g = blob.match(/\bG\s*0*(\d+)\b/) || blob.match(/GALP[AÃ]O\s*0*(\d+)/);
  if (g) {
    const n = Number(g[1]);
    if (n === 3) return "G3";
    if (n === 4) return "G4";
  }
  if (/\bGALPAO\b/.test(blob)) return "G4";
  return null;
}

function classifyCategory(cliente: string, tipo: string | null): string {
  const s = normalize(`${cliente} ${tipo ?? ""}`);
  if (/CERVEJ|BEBID|REFRIG|HEINEKEN|AMBEV|COCA|PEPSI|SUCO|AGUA|VINHO/.test(s)) return "Bebidas";
  if (/ALIMENT|NESTL|UNILEVER|ARROZ|FEIJ|PROTEIN|LACTI|LEITE|CAFE|BISCOIT/.test(s)) return "Alimentos";
  if (/CONSTR|CIMENT|TIJOL|FERRO|MADEIR|VOTORAN|TINTA|VEDA|PVC|TUBO|GERDAU/.test(s)) return "Construção";
  return "Diversos";
}

function tone(pct: number) {
  if (pct > 85) return {
    fill: "from-destructive/35 via-destructive/15 to-destructive/5",
    border: "border-destructive/60",
    ring: "ring-destructive/40",
    bar: "bg-destructive",
    chip: "bg-destructive/20 text-destructive border-destructive/40",
    hoverGlow: "hover:shadow-[0_8px_28px_-6px_hsl(var(--destructive)/0.55)]",
    dot: "bg-destructive",
  };
  if (pct > 60) return {
    fill: "from-warning/35 via-warning/15 to-warning/5",
    border: "border-warning/60",
    ring: "ring-warning/40",
    bar: "bg-warning",
    chip: "bg-warning/20 text-warning border-warning/40",
    hoverGlow: "hover:shadow-[0_8px_28px_-6px_hsl(var(--warning)/0.5)]",
    dot: "bg-warning",
  };
  return {
    fill: "from-success/35 via-success/15 to-success/5",
    border: "border-success/60",
    ring: "ring-success/40",
    bar: "bg-success",
    chip: "bg-success/20 text-success border-success/40",
    hoverGlow: "hover:shadow-[0_8px_28px_-6px_hsl(var(--success)/0.5)]",
    dot: "bg-success",
  };
}

function iconFor(t: "warehouse" | "quadra" | "patio" | "avaria") {
  if (t === "warehouse") return <Building2 className="h-3.5 w-3.5" />;
  if (t === "patio") return <MapPin className="h-3.5 w-3.5" />;
  if (t === "avaria") return <AlertTriangle className="h-3.5 w-3.5" />;
  return <Boxes className="h-3.5 w-3.5" />;
}

interface AreaStats {
  key: AreaKey;
  items: MapItem[];
  volumes: number;
  clientes: number;
  ctes: number;
  capacity: number;
  pct: number;
}

export function AdminWarehouseMap({ latestItems, allItems }: Props) {
  const [open, setOpen] = useState<AreaKey | null>(null);

  const { areaStats, kpis, alerts, topAreas } = useMemo(() => {
    const buckets = new Map<AreaKey, MapItem[]>();
    for (const a of AREAS) buckets.set(a, []);
    for (const it of latestItems) {
      const a = classifyArea(it);
      if (a) buckets.get(a)!.push(it);
    }

    const historyByInvArea = new Map<string, number>();
    for (const it of allItems) {
      const a = classifyArea(it);
      if (!a) continue;
      const k = `${it.inventory_id}|${a}`;
      historyByInvArea.set(k, (historyByInvArea.get(k) ?? 0) + (it.saldo_vol ?? 0));
    }
    const capacityByArea = new Map<AreaKey, number>();
    for (const [k, v] of historyByInvArea) {
      const a = k.split("|")[1] as AreaKey;
      capacityByArea.set(a, Math.max(capacityByArea.get(a) ?? 0, v));
    }

    const stats: AreaStats[] = AREAS.map((key) => {
      const items = buckets.get(key) ?? [];
      const volumes = items.reduce((s, i) => s + (i.saldo_vol ?? 0), 0);
      const clientes = new Set(items.map((i) => i.cliente).filter(Boolean)).size;
      const ctes = items.filter((i) => i.tipo === "CTW").length;
      const capacity = Math.max(capacityByArea.get(key) ?? 0, volumes, 1);
      const pct = Math.round((volumes / capacity) * 100);
      return { key, items, volumes, clientes, ctes, capacity, pct };
    });

    const totalVol = latestItems.reduce((s, i) => s + (i.saldo_vol ?? 0), 0);
    const totalCte = latestItems.filter((i) => i.tipo === "CTW").length;
    const activeClients = new Set(latestItems.map((i) => i.cliente).filter(Boolean)).size;
    const avariaVol = stats.find((s) => s.key === "AVARIA")?.volumes ?? 0;
    const locsUsed = stats.filter((s) => s.volumes > 0).length;
    const today = new Date();
    const days = latestItems
      .map((i) => i.entrada ? Math.max(0, Math.floor((today.getTime() - new Date(i.entrada + "T12:00:00").getTime()) / 86400000)) : null)
      .filter((d): d is number => d !== null);
    const avgPerm = days.length ? Math.round(days.reduce((a, b) => a + b, 0) / days.length) : 0;

    const alerts: { level: "red" | "yellow" | "green"; msg: string }[] = [];
    for (const s of stats) {
      if (s.pct > 90 && s.volumes > 0) alerts.push({ level: "red", msg: `${s.key} acima de 90% de ocupação (${s.pct}%)` });
    }
    const avaria = stats.find((s) => s.key === "AVARIA");
    if (avaria && avaria.pct > 75) alerts.push({ level: "red", msg: `Área de avaria acima do limite (${avaria.pct}%)` });
    const volByClient = new Map<string, number>();
    for (const i of latestItems) volByClient.set(i.cliente, (volByClient.get(i.cliente) ?? 0) + (i.saldo_vol ?? 0));
    for (const [cli, v] of volByClient) {
      if (totalVol > 0 && v / totalVol > 0.2) alerts.push({ level: "yellow", msg: `Cliente ${cli} ocupa ${Math.round((v / totalVol) * 100)}% do armazém` });
    }
    const long = days.filter((d) => d > 60).length;
    if (long > 100) alerts.push({ level: "yellow", msg: `${long} volumes com permanência superior a 60 dias` });
    if (alerts.length === 0) alerts.push({ level: "green", msg: "Todas as áreas operando normalmente" });

    const topAreas = [...stats].filter((s) => s.volumes > 0).sort((a, b) => b.pct - a.pct);

    return { areaStats: stats, kpis: { totalVol, totalCte, activeClients, avariaVol, locsUsed, avgPerm }, alerts, topAreas };
  }, [latestItems, allItems]);

  const selected = open ? areaStats.find((s) => s.key === open) ?? null : null;

  return (
    <div className="space-y-4 pt-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <TrendingUp className="h-3.5 w-3.5" />
        Visualização operacional baseada no inventário mais recente
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <KpiCard icon={<Layers className="h-4 w-4" />} label="Volumes" value={kpis.totalVol.toLocaleString("pt-BR")} accent />
        <KpiCard icon={<Truck className="h-4 w-4" />} label="CT-es" value={kpis.totalCte} />
        <KpiCard icon={<Users className="h-4 w-4" />} label="Clientes ativos" value={kpis.activeClients} />
        <KpiCard icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Vol. avaria" value={kpis.avariaVol.toLocaleString("pt-BR")} />
        <KpiCard icon={<MapPin className="h-4 w-4" />} label="Locais usados" value={`${kpis.locsUsed}/${AREAS.length}`} />
        <KpiCard icon={<Clock className="h-4 w-4 text-warning" />} label="Permanência média" value={`${kpis.avgPerm}d`} />
      </div>

      {/* Alerts */}
      <Card className="border-primary/30 bg-gradient-to-br from-primary/10 via-card to-card p-4 backdrop-blur">
        <div className="mb-3 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Alertas inteligentes</h2>
          <Badge variant="secondary" className="ml-auto">{alerts.length}</Badge>
        </div>
        <ul className="space-y-1.5">
          {alerts.map((a, i) => (
            <li key={i} className="flex items-start gap-2 rounded-md border bg-muted/20 px-2.5 py-1.5 text-sm">
              <span className="text-base leading-5">{a.level === "red" ? "🔴" : a.level === "yellow" ? "🟡" : "🟢"}</span>
              <span>{a.msg}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* Floor plan */}
      <Card
        className="relative overflow-hidden border-border/60 p-4"
        style={{
          background:
            "radial-gradient(ellipse at 50% 0%, hsl(var(--primary) / 0.10), transparent 60%), linear-gradient(180deg, hsl(var(--card)), hsl(var(--muted) / 0.35))",
        }}
      >
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <Warehouse className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Mapa operacional&nbsp;</h2>
          <Badge variant="outline" className="ml-2 hidden text-[10px] sm:inline-flex">CD · vista superior</Badge>
          <span className="ml-auto text-[11px] text-muted-foreground">clique em uma área para detalhes</span>
        </div>

        <div
          className="relative rounded-xl border border-border/50 p-3 sm:p-4"
          style={{
            background:
              "linear-gradient(180deg, hsl(var(--background) / 0.65), hsl(var(--muted) / 0.25)), repeating-linear-gradient(0deg, hsl(var(--border) / 0.18) 0 1px, transparent 1px 28px), repeating-linear-gradient(90deg, hsl(var(--border) / 0.18) 0 1px, transparent 1px 28px)",
          }}
        >
          {/* Compass + scale strip */}
          <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <span className="grid h-5 w-5 place-items-center rounded-full border bg-card">
                <span className="text-[9px] font-bold">N</span>
              </span>
              Planta baixa do armazém
            </span>
            <span className="hidden items-center gap-1.5 sm:inline-flex">
              <span className="h-1 w-8 rounded bg-foreground/60" />
              <span>~ 20 m</span>
            </span>
          </div>

          <div
            className="grid gap-2 sm:gap-3"
            style={{
              gridTemplateColumns: "repeat(12, minmax(0, 1fr))",
              gridTemplateRows: "repeat(10, minmax(48px, 1fr))",
            }}
          >
            {AREAS.map((k) => {
              const layout = LAYOUT[k];
              const s = areaStats.find((x) => x.key === k)!;
              return (
                <FloorBlock
                  key={k}
                  stats={s}
                  label={layout.short}
                  fullLabel={k}
                  icon={iconFor(layout.icon)}
                  colStart={layout.col[0]}
                  colEnd={layout.col[1]}
                  rowStart={layout.row[0]}
                  rowEnd={layout.row[1]}
                  onClick={() => setOpen(k)}
                />
              );
            })}
          </div>
        </div>

        {/* Legend */}
        <div className="mt-4 flex flex-wrap items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-success" /> 0–60%</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-warning" /> 61–85%</span>
          <span className="flex items-center gap-1.5"><span className="h-3 w-3 rounded-sm bg-destructive" /> &gt; 85%</span>
        </div>
      </Card>

      {/* Top localizações */}
      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <h2 className="font-semibold">Top localizações por ocupação</h2>
        </div>
        <ul className="space-y-2">
          {topAreas.map((s) => {
            const t = tone(s.pct);
            return (
              <li key={s.key}>
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{s.key}</span>
                  <span className="tabular-nums text-muted-foreground">{s.volumes.toLocaleString("pt-BR")} vol · {s.pct}%</span>
                </div>
                <div className="mt-1 h-2 overflow-hidden rounded-full bg-muted">
                  <div className={`h-full ${t.bar} transition-all`} style={{ width: `${Math.min(100, s.pct)}%` }} />
                </div>
              </li>
            );
          })}
          {topAreas.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
        </ul>
      </Card>

      {/* Detail sheet */}
      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent className="w-full overflow-y-auto sm:max-w-md">
          {selected && <AreaDetail stats={selected} />}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ----- Floor plan block (top-down with subtle 3D lift) -----

function FloorBlock({
  stats, label, fullLabel, icon, colStart, colEnd, rowStart, rowEnd, onClick,
}: {
  stats: AreaStats;
  label: string;
  fullLabel: string;
  icon: React.ReactNode;
  colStart: number; colEnd: number;
  rowStart: number; rowEnd: number;
  onClick: () => void;
}) {
  const t = tone(stats.pct);
  return (
    <button
      type="button"
      onClick={onClick}
      title={fullLabel}
      style={{
        gridColumn: `${colStart} / ${colEnd}`,
        gridRow: `${rowStart} / ${rowEnd}`,
      }}
      className={[
        "group relative flex flex-col rounded-xl border-2 text-left",
        "bg-gradient-to-br", t.fill, t.border,
        "shadow-[0_2px_0_0_hsl(var(--border)),0_8px_18px_-10px_rgba(0,0,0,0.55)]",
        "transition-all duration-200 ease-out",
        "hover:-translate-y-0.5 hover:scale-[1.015] hover:ring-2", t.ring, t.hoverGlow,
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
        "p-2.5 sm:p-3",
      ].join(" ")}
    >
      {/* corner status dot */}
      <span className={`absolute right-2 top-2 h-1.5 w-1.5 rounded-full ${t.dot} shadow-[0_0_8px_currentColor]`} aria-hidden />

      {/* header */}
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground/85">
        {icon}
        <span className="truncate">{label}</span>
      </div>

      {/* main metric */}
      <div className="mt-auto">
        <div className="flex items-end justify-between gap-2">
          <div>
            <div className="text-base font-bold leading-none tabular-nums sm:text-lg">
              {stats.volumes.toLocaleString("pt-BR")}
            </div>
            <div className="text-[9px] uppercase tracking-wide text-muted-foreground">volumes</div>
          </div>
          <span className={`rounded-md border px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${t.chip}`}>
            {stats.pct}%
          </span>
        </div>

        {/* occupancy bar */}
        <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-foreground/10">
          <div
            className={`h-full ${t.bar} transition-all duration-500`}
            style={{ width: `${Math.min(100, stats.pct)}%` }}
          />
        </div>

        <div className="mt-1.5 flex items-center justify-between text-[10px] text-muted-foreground">
          <span>{stats.clientes} cli</span>
          <span>{stats.ctes} ct-e</span>
        </div>
      </div>
    </button>
  );
}

// ----- KPI / Detail -----

function KpiCard({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={`p-3 ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function AreaDetail({ stats }: { stats: AreaStats }) {
  const t = tone(stats.pct);

  const volByClient = new Map<string, number>();
  for (const it of stats.items) volByClient.set(it.cliente, (volByClient.get(it.cliente) ?? 0) + (it.saldo_vol ?? 0));
  const topClients = [...volByClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  const today = new Date();
  const oldest = [...stats.items]
    .filter((i) => i.entrada)
    .map((i) => {
      const d = new Date(i.entrada! + "T12:00:00");
      const days = Math.max(0, Math.floor((today.getTime() - d.getTime()) / 86400000));
      return { cliente: i.cliente, entrada: i.entrada!, nf: i.nota_fiscal, days };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);

  const byCategory = new Map<string, number>();
  for (const it of stats.items) {
    const cat = classifyCategory(it.cliente, it.tipo);
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + (it.saldo_vol ?? 0));
  }
  const totalCatVol = [...byCategory.values()].reduce((a, b) => a + b, 0) || 1;
  const cats = ["Bebidas", "Alimentos", "Construção", "Diversos"];

  return (
    <>
      <SheetHeader>
        <div className="flex items-center gap-2">
          <Warehouse className="h-5 w-5 text-primary" />
          <SheetTitle>{stats.key}</SheetTitle>
          <Badge variant="outline" className={`ml-auto ${t.chip}`}>{stats.pct}% ocupação</Badge>
        </div>
        <SheetDescription>Detalhamento operacional da área</SheetDescription>
      </SheetHeader>

      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Volumes</div>
            <div className="text-lg font-bold tabular-nums">{stats.volumes.toLocaleString("pt-BR")}</div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">CT-es</div>
            <div className="text-lg font-bold tabular-nums">{stats.ctes}</div>
          </Card>
          <Card className="p-2.5 text-center">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Clientes</div>
            <div className="text-lg font-bold tabular-nums">{stats.clientes}</div>
          </Card>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Users className="h-3.5 w-3.5" /> Principais clientes</h3>
          <ul className="space-y-1.5">
            {topClients.map(([cli, v], i) => (
              <li key={cli + i} className="flex items-center justify-between rounded-md border bg-muted/20 px-2.5 py-1.5 text-sm">
                <span className="truncate"><span className="mr-1.5 font-mono text-xs text-muted-foreground">#{i + 1}</span>{cli}</span>
                <span className="font-mono text-xs tabular-nums">{v.toLocaleString("pt-BR")}</span>
              </li>
            ))}
            {topClients.length === 0 && <p className="text-xs text-muted-foreground">Sem clientes nesta área.</p>}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Clock className="h-3.5 w-3.5 text-warning" /> Cargas mais antigas</h3>
          <ul className="space-y-1.5">
            {oldest.map((o, i) => (
              <li key={i} className="rounded-md border bg-muted/20 px-2.5 py-1.5 text-sm">
                <div className="flex items-center justify-between">
                  <span className="truncate font-medium">{o.cliente}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-warning">{o.days}d</span>
                </div>
                <div className="text-[11px] text-muted-foreground">
                  entrada {new Date(o.entrada + "T12:00:00").toLocaleDateString("pt-BR")}{o.nf ? ` · NF ${o.nf}` : ""}
                </div>
              </li>
            ))}
            {oldest.length === 0 && <p className="text-xs text-muted-foreground">Sem dados de entrada.</p>}
          </ul>
        </div>

        <div>
          <h3 className="mb-2 flex items-center gap-1.5 text-sm font-semibold"><Package className="h-3.5 w-3.5" /> Distribuição por categoria</h3>
          <div className="space-y-2">
            {cats.map((cat) => {
              const v = byCategory.get(cat) ?? 0;
              const pct = Math.round((v / totalCatVol) * 100);
              return (
                <div key={cat}>
                  <div className="flex justify-between text-xs">
                    <span>{cat}</span>
                    <span className="tabular-nums text-muted-foreground">{v.toLocaleString("pt-BR")} · {pct}%</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </>
  );
}
