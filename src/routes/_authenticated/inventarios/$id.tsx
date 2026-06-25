import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  ArrowLeft, Check, X, Search, Loader2, Plus, MapPin, AlertTriangle, Package, ChevronDown, ChevronRight, Printer,
} from "lucide-react";
import { toast } from "sonner";
import { exportInventoryPdf } from "@/lib/inventory-pdf";
import { SplitProgress } from "@/components/split-progress";
import {
  enqueueStatusUpdate,
  enqueueObsUpdate,
  enqueueExtraInsert,
  enqueueExtraDelete,
  syncAll,
  useOnlineStatus,
  writeItemsSnapshot,
  writeExtrasSnapshot,
  writeInventorySnapshot,
  readItemsSnapshot,
  readExtrasSnapshot,
  readInventorySnapshot,
  applyPendingToItems,
} from "@/lib/offline-queue";
import { Wifi, WifiOff, CloudUpload } from "lucide-react";

export const Route = createFileRoute("/_authenticated/inventarios/$id")({
  component: InventoryPage,
});

type Status = "pendente" | "conferido" | "faltando";

interface Item {
  id: string;
  pagador_codigo: string | null;
  cliente: string;
  tipo_produto_codigo: number | null;
  tipo_produto_nome: string | null;
  entrada: string | null;
  nota_fiscal: string | null;
  tipo: string | null;
  cte: string | null;
  contrato: string | null;
  endereco: string | null;
  area: string | null;
  saldo_vol: number | null;
  saldo_financ: number | null;
  status: Status;
  observacoes: string | null;
}
interface Extra {
  id: string;
  endereco: string | null;
  cliente: string | null;
  nota_fiscal: string | null;
  observacoes: string;
  created_at: string;
}
interface Inv {
  id: string;
  name: string;
  shift: string;
  inventory_date: string;
  status: string;
}

function InventoryPage() {
  const { id } = Route.useParams();
  const nav = useNavigate();
  const [inv, setInv] = useState<Inv | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [extras, setExtras] = useState<Extra[]>([]);
  const [q, setQ] = useState("");
  const [openLocs, setOpenLocs] = useState<Set<string>>(new Set());
  const { online, pending } = useOnlineStatus();

  // Block analyst-only users from inventories
  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { fetchUserRoles } = await import("@/lib/user-roles");
      const roles = await fetchUserRoles(user.id);
      if (roles.includes("analyst") && !roles.includes("admin")) {
        nav({ to: "/admin", replace: true });
      }
    })();
  }, [nav]);

  // Auto-sync quando volta online
  useEffect(() => {
    if (!online) return;
    if (pending === 0) return;
    syncAll().then((r) => {
      if (r.ok > 0) {
        toast.success(`${r.ok} alteração${r.ok > 1 ? "ões" : ""} sincronizada${r.ok > 1 ? "s" : ""}`);
      }
      if (r.failed > 0) {
        toast.error(`${r.failed} registro(s) falharam — vão tentar de novo`);
      }
      if (r.verified) load();
    });
  }, [online, pending]);

  async function load() {
    // 1) Always try server first.
    const [invRes, itemsRes, extrasRes] = await Promise.all([
      supabase.from("inventories").select("*").eq("id", id).single(),
      supabase.from("inventory_items").select("*").eq("inventory_id", id).order("endereco"),
      supabase.from("extra_items").select("*").eq("inventory_id", id).order("created_at", { ascending: false }),
    ]);

    let invData: any = invRes.data;
    let itemsData: any[] | null = itemsRes.data as any;
    let extrasData: any[] | null = extrasRes.data as any;

    // 2) On any network/RLS error OR empty response while offline, fall back to local IDB snapshot.
    const serverOk = !invRes.error && !itemsRes.error && !extrasRes.error;
    if (serverOk && invData) {
      // Persist a fresh snapshot for offline reads.
      await Promise.all([
        writeInventorySnapshot(invData),
        writeItemsSnapshot(itemsData ?? []),
        writeExtrasSnapshot(extrasData ?? []),
      ]);
    } else {
      console.warn("[inventory] server load failed, using offline snapshot", {
        invErr: invRes.error?.message, itemsErr: itemsRes.error?.message, extrasErr: extrasRes.error?.message,
      });
      const [localInv, localItems, localExtras] = await Promise.all([
        readInventorySnapshot(id),
        readItemsSnapshot(id),
        readExtrasSnapshot(id),
      ]);
      invData = invData ?? localInv;
      itemsData = (itemsData && itemsData.length > 0) ? itemsData : localItems;
      extrasData = (extrasData && extrasData.length > 0) ? extrasData : localExtras;
    }

    // 3) Always overlay pending local changes on top of items so UI never loses them.
    const merged = await applyPendingToItems(itemsData ?? []);

    if (invData) setInv(invData as Inv);
    setItems(merged as Item[]);
    setExtras((extrasData ?? []) as Extra[]);
  }

  useEffect(() => { load(); }, [id]);

  const total = items.length;
  const ok = items.filter((i) => i.status === "conferido").length;
  const missing = items.filter((i) => i.status === "faltando").length;
  const done = ok + missing;
  const pct = total > 0 ? Math.round((done / total) * 100) : 0;

  // Filtered items
  const filtered = useMemo(() => {
    if (!q.trim()) return items;
    const s = q.toLowerCase();
    return items.filter((it) =>
      [it.nota_fiscal, it.cte, it.contrato, it.endereco, it.cliente, it.pagador_codigo]
        .some((v) => v?.toLowerCase().includes(s))
    );
  }, [items, q]);

  // Group by endereço
  const groups = useMemo(() => {
    const m = new Map<string, Item[]>();
    for (const it of filtered) {
      const k = it.endereco || "Sem endereço";
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(it);
    }
    return Array.from(m.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  // Local fully done? notify
  const completedLocs = useMemo(() => {
    const result: { loc: string; remaining: { loc: string; count: number }[] }[] = [];
    return result;
  }, []);

  async function setStatus(item: Item, status: Status) {
    const prev = item.status;
    setItems((arr) => arr.map((x) => (x.id === item.id ? { ...x, status } : x)));

    // Persist to IndexedDB FIRST — never rely on memory alone.
    await enqueueStatusUpdate(item.id, status);

    // Then attempt to sync immediately; on success the entry is removed from the queue.
    if (typeof navigator !== "undefined" && navigator.onLine) {
      const r = await syncAll();
      if (r.failed > 0) {
        toast.message("Salvo localmente — vai sincronizar automaticamente");
      }
    } else {
      toast.message("Salvo offline — sincroniza quando voltar a internet");
    }

    // Check if local just finished
    if (status !== "pendente" && item.endereco) {
      const sameLoc = items.filter((x) => x.endereco === item.endereco);
      const remaining = sameLoc.filter((x) => x.id !== item.id && x.status === "pendente");
      if (remaining.length === 0) {
        const pendingByLoc = new Map<string, number>();
        for (const x of items) {
          if (x.id === item.id) continue;
          if (x.status === "pendente") {
            const k = x.endereco || "Sem endereço";
            pendingByLoc.set(k, (pendingByLoc.get(k) ?? 0) + 1);
          }
        }
        const next = Array.from(pendingByLoc.entries())[0];
        if (next) {
          toast.success(`Local ${item.endereco} concluído! Próximo: ${next[0]} (${next[1]} pendente${next[1] > 1 ? "s" : ""})`);
        } else {
          toast.success("Local concluído! Inventário finalizado 🎉");
        }
      }
    }
    void prev;
  }

  async function saveObs(item: Item, obs: string) {
    setItems((arr) => arr.map((x) => (x.id === item.id ? { ...x, observacoes: obs } : x)));
    await enqueueObsUpdate(item.id, obs);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      await syncAll();
    }
  }

  function toggleLoc(loc: string) {
    setOpenLocs((s) => {
      const next = new Set(s);
      next.has(loc) ? next.delete(loc) : next.add(loc);
      return next;
    });
  }

  if (!inv) return <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>;

  const pendingLocs = items.reduce((acc, it) => {
    if (it.status === "pendente") {
      const k = it.endereco || "Sem endereço";
      acc.set(k, (acc.get(k) ?? 0) + 1);
    }
    return acc;
  }, new Map<string, number>());

  return (
    <div className="space-y-4">
      <Link to="/dashboard" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Voltar
      </Link>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{inv.name}</h1>
          <p className="text-xs text-muted-foreground">
            {new Date(inv.inventory_date + "T12:00:00").toLocaleDateString("pt-BR")} • turno {inv.shift}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => exportInventoryPdf(inv, items, extras)}>
          <Printer className="h-4 w-4" /> PDF
        </Button>
      </div>

      <div className="flex items-center gap-2 text-xs">
        {online ? (
          <Badge variant="outline" className="gap-1 border-success/40 text-success">
            <Wifi className="h-3 w-3" /> Online
          </Badge>
        ) : (
          <Badge variant="outline" className="gap-1 border-warning/40 text-warning">
            <WifiOff className="h-3 w-3" /> Offline — salvando local
          </Badge>
        )}
        {pending > 0 && (
          <Badge variant="outline" className="gap-1">
            <CloudUpload className="h-3 w-3" /> {pending} para sincronizar
          </Badge>
        )}
      </div>

      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-sm font-medium">Progresso</span>
          <span className="text-2xl font-bold text-primary">{pct}%</span>
        </div>
        <SplitProgress total={total} ok={ok} missing={missing} className="mt-2 h-2.5" />
        <div className="mt-1.5 flex justify-between text-[11px] font-medium">
          <span className="text-success">{total > 0 ? Math.round((ok / total) * 100) : 0}% OK</span>
          <span className="text-destructive">{total > 0 ? Math.round((missing / total) * 100) : 0}% faltando</span>
        </div>
        <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
          <div><div className="font-bold">{total}</div><div className="text-muted-foreground">Total</div></div>
          <div><div className="font-bold text-success">{ok}</div><div className="text-muted-foreground">OK</div></div>
          <div><div className="font-bold text-destructive">{missing}</div><div className="text-muted-foreground">Faltando</div></div>
          <div><div className="font-bold text-warning">{total - done}</div><div className="text-muted-foreground">Pendentes</div></div>
        </div>
      </Card>

      <Tabs defaultValue="cargas">
        <div className="sticky top-14 z-20 -mx-4 space-y-3 border-b bg-background/95 px-4 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="cargas">Cargas</TabsTrigger>
            <TabsTrigger value="locais">Locais</TabsTrigger>
            <TabsTrigger value="avarias">Avarias</TabsTrigger>
            <TabsTrigger value="extras">Extras ({extras.length})</TabsTrigger>
          </TabsList>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar NF, CT-e, cliente, endereço..." className="pl-9 pr-9" />
            {q && (
              <button
                type="button"
                onClick={() => setQ("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <TabsContent value="cargas" className="space-y-3 pt-4">

          {groups.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">Nada encontrado.</p>
          ) : (
            groups.map(([loc, list]) => {
              const allDone = list.every((x) => x.status !== "pendente");
              const isOpen = openLocs.has(loc) || q.trim() !== "";
              return (
                <Card key={loc} className="overflow-hidden">
                  <button
                    onClick={() => toggleLoc(loc)}
                    className="flex w-full items-center justify-between gap-2 p-3 text-left hover:bg-accent/40"
                  >
                    <div className="flex min-w-0 items-center gap-2">
                      <MapPin className={`h-4 w-4 shrink-0 ${allDone ? "text-success" : "text-primary"}`} />
                      <span className="truncate font-medium">{loc}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={allDone ? "default" : "secondary"} className={allDone ? "bg-success text-success-foreground" : ""}>
                        {list.filter((x) => x.status !== "pendente").length}/{list.length}
                      </Badge>
                      {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </div>
                  </button>
                  {isOpen && (
                    <ul className="divide-y border-t">
                      {list.map((it) => <ItemRow key={it.id} item={it} onSet={setStatus} onObs={saveObs} />)}
                    </ul>
                  )}
                </Card>
              );
            })
          )}
        </TabsContent>

        <TabsContent value="locais" className="space-y-2 pt-4">
          <p className="text-xs text-muted-foreground">Locais com cargas pendentes:</p>
          {pendingLocs.size === 0 ? (
            <Card className="p-6 text-center text-sm text-muted-foreground">Tudo conferido! 🎉</Card>
          ) : (
            Array.from(pendingLocs.entries())
              .sort((a, b) => a[0].localeCompare(b[0]))
              .map(([loc, count]) => (
                <Card key={loc} className="flex items-center justify-between p-3">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-warning" />
                    <span className="font-medium">{loc}</span>
                  </div>
                  <Badge variant="secondary">{count} pendente{count > 1 ? "s" : ""}</Badge>
                </Card>
              ))
          )}
        </TabsContent>

        <TabsContent value="avarias" className="space-y-3 pt-4">
          <AvariasTab items={items} onSet={setStatus} onObs={saveObs} />
        </TabsContent>

        <TabsContent value="extras" className="space-y-3 pt-4">
          <ExtrasSection inventoryId={id} extras={extras} onChange={load} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function AvariasTab({
  items, onSet, onObs,
}: { items: Item[]; onSet: (it: Item, s: Status) => void; onObs: (it: Item, obs: string) => void }) {
  const avarias = items.filter(isAvaria);
  if (avarias.length === 0) {
    return <Card className="p-6 text-center text-sm text-muted-foreground">Nenhuma avaria neste inventário.</Card>;
  }
  const groups = new Map<string, Item[]>();
  for (const it of avarias) {
    const tipo = avariaTipo(it.nota_fiscal)?.label ?? "Sem classificação";
    if (!groups.has(tipo)) groups.set(tipo, []);
    groups.get(tipo)!.push(it);
  }
  const order = ["Origem Belém", "Avaria Interna", "Origem Cliente", "Devolução", "Sem classificação"];
  const sorted = [...groups.entries()].sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {order.slice(0, 4).map((label) => {
          const n = groups.get(label)?.length ?? 0;
          return (
            <Card key={label} className="p-2.5 text-center">
              <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
              <div className="mt-0.5 text-xl font-bold">{n}</div>
            </Card>
          );
        })}
      </div>
      {sorted.map(([tipo, list]) => {
        const av = avariaTipo(list[0].nota_fiscal);
        return (
          <Card key={tipo} className="overflow-hidden">
            <div className="flex items-center justify-between border-b bg-muted/40 p-3">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-warning" />
                <span className="font-semibold">{tipo}</span>
                {av && <Badge variant="outline" className={`text-[10px] ${av.cls}`}>regra</Badge>}
              </div>
              <Badge variant="secondary">{list.length}</Badge>
            </div>
            <ul className="divide-y">
              {list.map((it) => <ItemRow key={it.id} item={it} onSet={onSet} onObs={onObs} />)}
            </ul>
          </Card>
        );
      })}
    </div>
  );
}

function avariaTipo(nf: string | null): { label: string; cls: string } | null {
  if (!nf) return null;
  const zeros = (nf.match(/^0*/)?.[0] ?? "").length;
  if (zeros === 0) return { label: "Devolução", cls: "bg-blue-500/15 text-blue-700 border-blue-500/30" };
  if (zeros === 1) return { label: "Origem Belém", cls: "bg-amber-500/15 text-amber-700 border-amber-500/30" };
  if (zeros === 2) return { label: "Avaria Interna", cls: "bg-destructive/15 text-destructive border-destructive/30" };
  return { label: "Origem Cliente", cls: "bg-purple-500/15 text-purple-700 border-purple-500/30" };
}

function isAvaria(item: Item): boolean {
  const v = `${item.area ?? ""} ${item.endereco ?? ""} ${item.cliente ?? ""}`.toUpperCase();
  return /AVARIA/.test(v);
}

function ItemRow({
  item, onSet, onObs,
}: { item: Item; onSet: (it: Item, s: Status) => void; onObs: (it: Item, obs: string) => void }) {
  const [open, setOpen] = useState(false);
  const [obs, setObs] = useState(item.observacoes ?? "");

  const statusColor =
    item.status === "conferido" ? "border-l-success bg-success/5"
    : item.status === "faltando" ? "border-l-destructive bg-destructive/5"
    : "border-l-transparent";

  const av = isAvaria(item) ? avariaTipo(item.nota_fiscal) : null;

  return (
    <li className={`border-l-4 ${statusColor} p-3`}>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-sm">
            <span className="font-semibold">NF {item.nota_fiscal}</span>
            {item.cte && <Badge variant="outline" className="font-mono text-[10px]">CT-e {item.cte}</Badge>}
            {item.tipo_produto_codigo && (
              <Badge variant="secondary" className="text-[10px]">{item.tipo_produto_codigo} • {item.tipo_produto_nome}</Badge>
            )}
            {av && (
              <Badge variant="outline" className={`text-[10px] ${av.cls}`}>{av.label}</Badge>
            )}
          </div>
          <div className="mt-1 truncate text-xs text-muted-foreground">
            {item.pagador_codigo && (
              <span className="mr-1 font-mono font-semibold text-foreground">{item.pagador_codigo}</span>
            )}
            {item.cliente}
          </div>
          <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
            {item.entrada && (
              <span className="font-medium text-foreground">
                Entrada {new Date(item.entrada + "T12:00:00").toLocaleDateString("pt-BR")}
              </span>
            )}
            {item.contrato && <span>Contrato {item.contrato}</span>}
            {item.saldo_vol != null && <span>Vol {item.saldo_vol}</span>}
            {item.saldo_financ != null && <span>Fin {item.saldo_financ}</span>}
          </div>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon" variant={item.status === "conferido" ? "default" : "outline"}
            onClick={() => onSet(item, item.status === "conferido" ? "pendente" : "conferido")}
            className={item.status === "conferido" ? "bg-success hover:bg-success/90" : ""}
            aria-label="Conferido"
          ><Check className="h-4 w-4" /></Button>
          <Button
            size="icon" variant={item.status === "faltando" ? "destructive" : "outline"}
            onClick={() => onSet(item, item.status === "faltando" ? "pendente" : "faltando")}
            aria-label="Faltando"
          ><X className="h-4 w-4" /></Button>
        </div>
      </div>
      {item.observacoes && !open && (
        <div className="mt-2 rounded-md border border-warning/30 bg-warning/10 p-2 text-xs whitespace-pre-wrap">
          <span className="font-semibold">Obs:</span> {item.observacoes}
        </div>
      )}
      <button onClick={() => setOpen((v) => !v)} className="mt-2 text-[11px] text-primary hover:underline">
        {open ? "Fechar" : item.observacoes ? "Editar observação" : "+ Observação"}
      </button>
      {open && (
        <div className="mt-2 flex gap-2">
          <Textarea value={obs} onChange={(e) => setObs(e.target.value)} rows={2} placeholder="Observação..." className="text-xs" />
          <Button size="sm" onClick={() => { onObs(item, obs); setOpen(false); toast.success("Salvo"); }}>Salvar</Button>
        </div>
      )}
    </li>
  );
}

function ExtrasSection({
  inventoryId, extras, onChange,
}: { inventoryId: string; extras: Extra[]; onChange: () => void }) {
  const [open, setOpen] = useState(false);
  const [endereco, setEndereco] = useState("");
  const [cliente, setCliente] = useState("");
  const [nf, setNf] = useState("");
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!obs.trim()) return toast.error("Coloque uma observação");
    setBusy(true);
    const local_id =
      (typeof crypto !== "undefined" && "randomUUID" in crypto)
        ? crypto.randomUUID()
        : `local-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    await enqueueExtraInsert({
      local_id,
      inventory_id: inventoryId,
      endereco: endereco || null,
      cliente: cliente || null,
      nota_fiscal: nf || null,
      observacoes: obs.trim(),
    });
    if (typeof navigator !== "undefined" && navigator.onLine) {
      await syncAll();
    }
    setBusy(false);
    setEndereco(""); setCliente(""); setNf(""); setObs("");
    setOpen(false); onChange();
    toast.success("Carga extra registrada");
  }

  async function remove(id: string) {
    await enqueueExtraDelete(id);
    if (typeof navigator !== "undefined" && navigator.onLine) {
      await syncAll();
    }
    onChange();
  }

  return (
    <>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger asChild>
          <Button className="w-full"><Plus className="h-4 w-4" /> Adicionar carga extra</Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-warning" /> Carga fora do sistema
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={add} className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>Endereço</Label>
                <Input value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="Ex: 411" />
              </div>
              <div className="space-y-1.5">
                <Label>NF</Label>
                <Input value={nf} onChange={(e) => setNf(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Cliente</Label>
              <Input value={cliente} onChange={(e) => setCliente(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Observação *</Label>
              <Textarea required value={obs} onChange={(e) => setObs(e.target.value)} rows={3} />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={busy} className="w-full">
                {busy ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {extras.length === 0 ? (
        <Card className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
          <Package className="h-8 w-8" /> Nenhuma carga extra ainda.
        </Card>
      ) : (
        <ul className="space-y-2">
          {extras.map((e) => (
            <li key={e.id}>
              <Card className="p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap gap-1.5 text-xs">
                      {e.endereco && <Badge variant="outline">📍 {e.endereco}</Badge>}
                      {e.nota_fiscal && <Badge variant="outline">NF {e.nota_fiscal}</Badge>}
                    </div>
                    {e.cliente && <div className="mt-1 text-sm font-medium">{e.cliente}</div>}
                    <p className="mt-1 text-sm">{e.observacoes}</p>
                  </div>
                  <Button size="icon" variant="ghost" onClick={() => remove(e.id)}>
                    <X className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
