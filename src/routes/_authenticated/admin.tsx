import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/use-user-role";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Loader2, Package, AlertTriangle, FileText, Users, MapPin, ShieldAlert, Trophy,
  Layers, Clock, BarChart3, TrendingUp, Pencil, Check, X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { SplitProgress } from "@/components/split-progress";
import { renameInventoryAdmin } from "@/lib/admin.functions";
import { AdminWarehouseMap } from "@/components/admin-warehouse-map";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminPanel,
});

interface Inv {
  id: string;
  name: string;
  shift: string;
  inventory_date: string;
  status: string;
  user_id: string;
  created_at: string;
}
interface Item {
  inventory_id: string;
  cliente: string;
  tipo: string | null;
  endereco: string | null;
  area: string | null;
  status: string;
  saldo_vol: number | null;
  saldo_financ: number | null;
  entrada: string | null;
  nota_fiscal: string | null;
}
interface Extra { inventory_id: string }
interface Profile { id: string; display_name: string }

function isAvariaArea(it: Item) {
  return /AVARIA/.test(`${it.area ?? ""} ${it.endereco ?? ""} ${it.cliente ?? ""}`.toUpperCase());
}

function AdminPanel() {
  const { isAdmin, canViewAdmin } = useUserRole();
  const canEdit = isAdmin === true;
  const allowed = canViewAdmin;
  const nav = useNavigate();
  const [loading, setLoading] = useState(true);
  const [invs, setInvs] = useState<Inv[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});

  useEffect(() => { if (allowed === false) nav({ to: "/dashboard" }); }, [allowed, nav]);

  useEffect(() => {
    if (!allowed) return;
    (async () => {
      const [invsRes, extrasRes, profsRes] = await Promise.all([
        supabase.from("inventories").select("id,name,shift,inventory_date,status,user_id,created_at").order("created_at", { ascending: false }),
        supabase.from("extra_items").select("inventory_id"),
        supabase.from("profiles").select("id,display_name"),
      ]);
      const invsData = (invsRes.data ?? []) as Inv[];
      setInvs(invsData);
      setExtras(extrasRes.data ?? []);
      const map: Record<string, string> = {};
      for (const p of (profsRes.data ?? []) as Profile[]) map[p.id] = p.display_name;
      setProfiles(map);

      // Fetch ALL items paginated to bypass the 1000-row default limit
      const all: Item[] = [];
      const pageSize = 1000;
      for (let from = 0; ; from += pageSize) {
        const { data, error } = await supabase
          .from("inventory_items")
          .select("inventory_id,cliente,tipo,endereco,area,status,saldo_vol,saldo_financ,entrada,nota_fiscal")
          .range(from, from + pageSize - 1);
        if (error || !data || data.length === 0) break;
        all.push(...(data as Item[]));
        if (data.length < pageSize) break;
      }
      setItems(all);
      setLoading(false);
    })();
  }, [allowed]);

  // ── Latest inventory ──
  const latest = invs[0] ?? null;
  const latestItems = useMemo(
    () => (latest ? items.filter((it) => it.inventory_id === latest.id) : []),
    [items, latest],
  );

  // ── KPIs do inventário mais recente ──
  const lTotal = latestItems.length;
  const lOk = latestItems.filter((i) => i.status === "conferido").length;
  const lMissing = latestItems.filter((i) => i.status === "faltando").length;
  const lDone = lOk + lMissing;
  const lPend = lTotal - lDone;
  const lPct = lTotal ? Math.round((lDone / lTotal) * 100) : 0;
  const lCtw = latestItems.filter((i) => i.tipo === "CTW").length;
  const lNfw = latestItems.filter((i) => i.tipo === "NFW").length;
  const lAvariasItems = latestItems.filter(isAvariaArea);
  const lAvarias = lAvariasItems.length;
  const lVol = latestItems.reduce((s, i) => s + (i.saldo_vol ?? 0), 0);

  // ── Rankings do inventário mais recente ──
  const volByClient = new Map<string, number>();
  const cargasByClient = new Map<string, number>();
  const avariasByClient = new Map<string, number>();
  for (const it of latestItems) {
    volByClient.set(it.cliente, (volByClient.get(it.cliente) ?? 0) + (it.saldo_vol ?? 0));
    cargasByClient.set(it.cliente, (cargasByClient.get(it.cliente) ?? 0) + 1);
  }
  for (const it of lAvariasItems) {
    avariasByClient.set(it.cliente, (avariasByClient.get(it.cliente) ?? 0) + 1);
  }
  const topVolume = [...volByClient.entries()].filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const topCargas = [...cargasByClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const topAvariasCliente = [...avariasByClient.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);

  // Cliente mais tempo no galpão (estoque atual = inventário mais recente)
  const oldestByClient = new Map<string, { entrada: string; nf: string | null; endereco: string | null }>();
  for (const it of latestItems) {
    if (!it.entrada) continue;
    const cur = oldestByClient.get(it.cliente);
    if (!cur || it.entrada < cur.entrada) {
      oldestByClient.set(it.cliente, { entrada: it.entrada, nf: it.nota_fiscal, endereco: it.endereco });
    }
  }
  const today = new Date();
  const longestStaying = [...oldestByClient.entries()]
    .map(([cli, d]) => {
      const entrada = new Date(d.entrada + "T12:00:00");
      const days = Math.max(0, Math.floor((today.getTime() - entrada.getTime()) / 86400000));
      return { cli, entrada: d.entrada, nf: d.nf, endereco: d.endereco, days };
    })
    .sort((a, b) => b.days - a.days)
    .slice(0, 10);

  // Ranking de inventários por pessoa (histórico — quem mais trabalhou)
  const invsPorUser = new Map<string, number>();
  for (const inv of invs) invsPorUser.set(inv.user_id, (invsPorUser.get(inv.user_id) ?? 0) + 1);
  const rankingUsers = [...invsPorUser.entries()]
    .map(([uid, n]) => ({ name: profiles[uid] ?? "—", count: n }))
    .sort((a, b) => b.count - a.count);

  // Avarias por tipo — INVENTÁRIO RECENTE
  function avariaTipo(nf: string | null) {
    if (!nf) return "Sem classif.";
    const zeros = (nf.match(/^0*/)?.[0] ?? "").length;
    if (zeros === 0) return "Devolução";
    if (zeros === 1) return "Origem Belém";
    if (zeros === 2) return "Avaria Interna";
    return "Origem Cliente";
  }
  const avariasPorTipo = new Map<string, number>();
  for (const it of lAvariasItems) {
    const t = avariaTipo(it.nota_fiscal);
    avariasPorTipo.set(t, (avariasPorTipo.get(t) ?? 0) + 1);
  }

  // Por endereço (latest)
  const porEndereco = new Map<string, { total: number; done: number; ok: number; missing: number }>();
  for (const it of latestItems) {
    const key = it.endereco?.trim() || it.area?.trim() || "Sem endereço";
    const c = porEndereco.get(key) ?? { total: 0, done: 0, ok: 0, missing: 0 };
    c.total++;
    if (it.status === "conferido") { c.ok++; c.done++; }
    else if (it.status === "faltando") { c.missing++; c.done++; }
    porEndereco.set(key, c);
  }
  const enderecos = [...porEndereco.entries()].sort((a, b) => b[1].total - a[1].total);

  // Itens por inventário
  const itemsByInv = new Map<string, { total: number; done: number }>();
  for (const it of items) {
    const c = itemsByInv.get(it.inventory_id) ?? { total: 0, done: 0 };
    c.total++;
    if (it.status !== "pendente") c.done++;
    itemsByInv.set(it.inventory_id, c);
  }
  const extrasByInv = new Map<string, number>();
  for (const e of extras) extrasByInv.set(e.inventory_id, (extrasByInv.get(e.inventory_id) ?? 0) + 1);

  if (allowed === null || loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;
  }
  if (allowed === false) {
    return (
      <Card className="flex flex-col items-center gap-2 p-10 text-center">
        <ShieldAlert className="h-10 w-10 text-destructive" />
        <p className="text-sm text-muted-foreground">Acesso restrito.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="relative overflow-hidden rounded-xl border bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-5">
        <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/10 blur-2xl" />
        <div className="relative flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-primary">
              <BarChart3 className="h-3.5 w-3.5" /> Painel Admin · WMS
            </div>
            <h1 className="mt-1 text-2xl font-bold tracking-tight">Controle Operacional</h1>
            <p className="text-sm text-muted-foreground">
              Combitrans · {invs.length} inventários · {Object.keys(profiles).length} operadores
            </p>
          </div>
          {latest && (
            <div className="rounded-lg border bg-card/80 px-3 py-2 text-right backdrop-blur">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">Último inventário</div>
              <div className="text-sm font-semibold">{new Date(latest.inventory_date + "T12:00:00").toLocaleDateString("pt-BR")}</div>
              <div className="text-[11px] text-muted-foreground">turno {latest.shift} · {profiles[latest.user_id] ?? "—"}</div>
            </div>
          )}
        </div>
      </div>

      <Tabs defaultValue="resumo">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="resumo">Resumo</TabsTrigger>
          <TabsTrigger value="rankings">Rankings</TabsTrigger>
          <TabsTrigger value="equipe">Equipe</TabsTrigger>
          <TabsTrigger value="mapa3d">Mapa 3D</TabsTrigger>
        </TabsList>

        {/* RESUMO — inventário mais recente */}
        <TabsContent value="resumo" className="space-y-4 pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Métricas do inventário mais recente {latest && `(${latest.name})`}
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi icon={<Package className="h-4 w-4 text-primary" />} label="Cargas" value={lTotal} accent />
            <Kpi icon={<FileText className="h-4 w-4" />} label="CTW / NFW" value={`${lCtw} / ${lNfw}`} />
            <Kpi icon={<AlertTriangle className="h-4 w-4 text-destructive" />} label="Avarias" value={lAvarias} />
            <Kpi icon={<Layers className="h-4 w-4" />} label="Volume" value={lVol.toLocaleString("pt-BR", { maximumFractionDigits: 0 })} />
          </div>

          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">Progresso de conferência</span>
              <span className="text-3xl font-bold text-primary tabular-nums">{lPct}%</span>
            </div>
            <SplitProgress total={lTotal} ok={lOk} missing={lMissing} className="mt-2 h-2.5" />
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-xs">
              <div className="rounded-md bg-muted/50 py-2">
                <div className="font-bold">{lTotal}</div><div className="text-muted-foreground">Total</div>
              </div>
              <div className="rounded-md bg-success/10 py-2">
                <div className="font-bold text-success">{lOk}</div><div className="text-muted-foreground">OK</div>
              </div>
              <div className="rounded-md bg-destructive/10 py-2">
                <div className="font-bold text-destructive">{lMissing}</div><div className="text-muted-foreground">Faltando</div>
              </div>
              <div className="rounded-md bg-warning/10 py-2">
                <div className="font-bold text-warning">{lPend}</div><div className="text-muted-foreground">Pendentes</div>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" /> Cargas por endereço</h2>
            <ul className="space-y-2.5 max-h-72 overflow-auto pr-1">
              {enderecos.map(([end, c]) => {
                const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
                return (
                  <li key={end}>
                    <div className="flex justify-between text-sm">
                      <span className="font-medium">{end}</span>
                      <span className="text-muted-foreground tabular-nums">{c.done}/{c.total} • {pct}%</span>
                    </div>
                    <SplitProgress total={c.total} ok={c.ok} missing={c.missing} className="mt-1.5 h-1.5" />
                  </li>
                );
              })}
              {enderecos.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 flex items-center gap-2 font-semibold">
              <AlertTriangle className="h-4 w-4 text-warning" /> Avarias por tipo (inventário recente)
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {["Origem Belém", "Avaria Interna", "Origem Cliente", "Devolução"].map((t) => (
                <div key={t} className="rounded-lg border bg-muted/30 p-2.5 text-center">
                  <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t}</div>
                  <div className="mt-0.5 text-xl font-bold tabular-nums">{avariasPorTipo.get(t) ?? 0}</div>
                </div>
              ))}
            </div>
            <div className="mt-2 text-[11px] text-muted-foreground">Total: {lAvarias} avaria{lAvarias === 1 ? "" : "s"}</div>
          </Card>
        </TabsContent>

        {/* RANKINGS — inventário recente */}
        <TabsContent value="rankings" className="space-y-4 pt-4">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <TrendingUp className="h-3.5 w-3.5" />
            Rankings baseados no inventário mais recente {latest && `(${latest.name})`}
          </div>
          <RankCard
            icon={<AlertTriangle className="h-4 w-4 text-destructive" />}
            title="Clientes com mais avarias"
            sub="Quantidade de cargas em área de avaria"
            items={topAvariasCliente.map(([cli, n]) => ({ left: cli, right: String(n) }))}
          />
          <RankCard
            icon={<Layers className="h-4 w-4 text-primary" />}
            title="Maior volume no galpão"
            sub="Soma do saldo de volumes"
            items={topVolume.map(([cli, v]) => ({
              left: cli,
              right: v.toLocaleString("pt-BR", { maximumFractionDigits: 0 }),
            }))}
          />
          <RankCard
            icon={<Clock className="h-4 w-4 text-warning" />}
            title="Mais tempo no galpão"
            sub="Carga com data de entrada mais antiga"
            items={longestStaying.map((r) => ({
              left: r.cli,
              right: `${r.days} dia${r.days === 1 ? "" : "s"}`,
              sub: `entrada ${new Date(r.entrada + "T12:00:00").toLocaleDateString("pt-BR")}${r.endereco ? ` · ${r.endereco}` : ""}`,
            }))}
          />
          <RankCard
            icon={<Package className="h-4 w-4" />}
            title="Mais cargas"
            sub="Total de cargas por cliente"
            items={topCargas.map(([cli, n]) => ({ left: cli, right: String(n) }))}
          />
        </TabsContent>

        {/* EQUIPE */}
        <TabsContent value="equipe" className="space-y-4 pt-4">
          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Trophy className="h-4 w-4 text-warning" />
              <h2 className="font-semibold">Ranking de operadores</h2>
            </div>
            <ol className="space-y-2">
              {rankingUsers.map((u, idx) => {
                const max = rankingUsers[0]?.count || 1;
                const pct = Math.round((u.count / max) * 100);
                const medal = idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : null;
                return (
                  <li key={u.name + idx} className="rounded-md border p-2.5">
                    <div className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2 truncate">
                        <span className="w-6 font-mono text-xs text-muted-foreground">#{idx + 1}</span>
                        <span className="truncate font-medium">{u.name}</span>
                        {medal && <span>{medal}</span>}
                      </span>
                      <span className="font-mono font-semibold tabular-nums">{u.count}</span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} />
                    </div>
                  </li>
                );
              })}
              {rankingUsers.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
            </ol>
          </Card>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2">
              <Users className="h-4 w-4" />
              <h2 className="font-semibold">Inventários da equipe</h2>
              <Badge variant="secondary" className="ml-auto">{invs.length}</Badge>
            </div>
            <ul className="space-y-2.5">
              {invs.map((inv) => {
                const c = itemsByInv.get(inv.id) ?? { total: 0, done: 0 };
                const pct = c.total > 0 ? Math.round((c.done / c.total) * 100) : 0;
                const ext = extrasByInv.get(inv.id) ?? 0;
                return (
                  <li key={inv.id} className="rounded-md border p-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <InventoryNameEditor
                          inv={inv}
                          canEdit={canEdit}
                          onSaved={(name) =>
                            setInvs((prev) => prev.map((x) => (x.id === inv.id ? { ...x, name } : x)))
                          }
                        />
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {profiles[inv.user_id] ?? "—"} · {new Date(inv.inventory_date + "T12:00:00").toLocaleDateString("pt-BR")} · turno {inv.shift}
                        </div>
                      </div>
                      <div className="text-right text-xs">
                        <div className="font-medium tabular-nums">{c.done}/{c.total}</div>
                        {ext > 0 && <div className="text-muted-foreground">+{ext} extras</div>}
                      </div>
                    </div>
                    <Progress value={pct} className="mt-2 h-1.5" />
                  </li>
                );
              })}
              {invs.length === 0 && <p className="text-sm text-muted-foreground">Nenhum inventário registrado.</p>}
            </ul>
          </Card>
        </TabsContent>
        <TabsContent value="mapa3d">
          <AdminWarehouseMap latestItems={latestItems} allItems={items} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function Kpi({ icon, label, value, accent }: { icon?: React.ReactNode; label: string; value: React.ReactNode; accent?: boolean }) {
  return (
    <Card className={`p-3 ${accent ? "border-primary/30 bg-primary/5" : ""}`}>
      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
    </Card>
  );
}

function RankCard({
  icon, title, sub, items,
}: { icon: React.ReactNode; title: string; sub?: string; items: { left: string; right: string; sub?: string }[] }) {
  return (
    <Card className="p-4">
      <div className="mb-3">
        <div className="flex items-center gap-2 font-semibold">{icon}{title}</div>
        {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      <ol className="space-y-1.5">
        {items.map((it, idx) => (
          <li key={it.left + idx} className="flex items-start justify-between gap-2 rounded-md border bg-muted/20 px-2.5 py-2 text-sm">
            <span className="flex min-w-0 items-start gap-2">
              <span className="w-6 shrink-0 font-mono text-xs text-muted-foreground">#{idx + 1}</span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{it.left}</span>
                {it.sub && <span className="block text-[10px] text-muted-foreground">{it.sub}</span>}
              </span>
            </span>
            <span className="shrink-0 font-mono text-sm font-semibold tabular-nums">{it.right}</span>
          </li>
        ))}
        {items.length === 0 && <p className="text-sm text-muted-foreground">Sem dados.</p>}
      </ol>
    </Card>
  );
}

function InventoryNameEditor({
  inv, onSaved, canEdit,
}: { inv: Inv; onSaved: (name: string) => void; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(inv.name);
  const [busy, setBusy] = useState(false);
  const renameFn = useServerFn(renameInventoryAdmin);

  async function save() {
    const name = value.trim();
    if (!name || name === inv.name) { setEditing(false); setValue(inv.name); return; }
    setBusy(true);
    try {
      await renameFn({ data: { inventory_id: inv.id, name } });
      onSaved(name);
      setEditing(false);
      toast.success("Nome atualizado");
    } catch (err) {
      console.error("rename inventory failed", err);
      toast.error("Não foi possível renomear. Verifique se você é admin.");
    } finally {
      setBusy(false);
    }
  }

  if (editing && canEdit) {
    return (
      <div className="flex items-center gap-1">
        <Input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") save(); if (e.key === "Escape") { setEditing(false); setValue(inv.name); } }}
          autoFocus
          className="h-7 text-sm"
        />
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={save} disabled={busy} aria-label="Salvar">
          <Check className="h-3.5 w-3.5 text-success" />
        </Button>
        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => { setEditing(false); setValue(inv.name); }} aria-label="Cancelar">
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-1.5">
      <div className="truncate text-sm font-semibold">{inv.name}</div>
      {canEdit && (
        <button
          onClick={() => setEditing(true)}
          className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Renomear"
        >
          <Pencil className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

