import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, FileText, Loader2, Trash2, ChevronRight, CheckCircle2, XCircle, Clock3, Package } from "lucide-react";
import { toast } from "sonner";
import { parseInventoryPdf } from "@/lib/pdf-parser";
import { parseInventoryXls } from "@/lib/xls-parser";
import { SplitProgress } from "@/components/split-progress";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

interface InvRow {
  id: string;
  name: string;
  shift: string;
  inventory_date: string;
  status: string;
  total: number;
  ok: number;
  missing: number;
}

function DashboardPage() {
  const nav = useNavigate();
  const [rows, setRows] = useState<InvRow[] | null>(null);
  const [open, setOpen] = useState(false);

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

  async function load() {
    const { data: invs } = await supabase
      .from("inventories")
      .select("id,name,shift,inventory_date,status")
      .order("created_at", { ascending: false });
    if (!invs) return setRows([]);

    const ids = invs.map((i) => i.id);
    const counts: Record<string, { total: number; ok: number; missing: number }> = {};
    if (ids.length) {
      // Paginação: a query padrão do Supabase tem limite de 1000 linhas.
      // Sem paginar, as contagens ficam erradas quando há muitos itens.
      const pageSize = 1000;
      let from = 0;
      while (true) {
        const { data: items, error } = await supabase
          .from("inventory_items")
          .select("inventory_id,status")
          .in("inventory_id", ids)
          .range(from, from + pageSize - 1);
        if (error || !items) break;
        for (const it of items) {
          const c = (counts[it.inventory_id] ??= { total: 0, ok: 0, missing: 0 });
          c.total++;
          if (it.status === "conferido") c.ok++;
          else if (it.status === "faltando") c.missing++;
        }
        if (items.length < pageSize) break;
        from += pageSize;
      }
    }
    setRows(
      invs.map((i) => ({
        ...i,
        total: counts[i.id]?.total ?? 0,
        ok: counts[i.id]?.ok ?? 0,
        missing: counts[i.id]?.missing ?? 0,
      })),
    );
  }

  useEffect(() => { load(); }, []);

  async function remove(id: string) {
    if (!confirm("Apagar este inventário?")) return;
    await supabase.from("inventory_items").delete().eq("inventory_id", id);
    await supabase.from("extra_items").delete().eq("inventory_id", id);
    const { error } = await supabase.from("inventories").delete().eq("id", id);
    if (error) {
      console.error("delete inventory failed", error);
      toast.error("Não foi possível apagar o inventário. Tente novamente.");
      return;
    }
    toast.success("Inventário apagado");
    load();
  }

  // Stats do inventário mais recente (rows já vem ordenado por created_at desc)
  const latest = rows && rows.length > 0 ? rows[0] : null;
  const stats = latest
    ? { total: latest.total, ok: latest.ok, missing: latest.missing }
    : null;
  const pending = stats ? stats.total - stats.ok - stats.missing : 0;

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight">Meus inventários</h1>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button><Plus className="h-4 w-4" /> Novo</Button>
          </DialogTrigger>
          <NewInventoryDialog onCreated={(id) => { setOpen(false); load(); nav({ to: "/inventarios/$id", params: { id } }); }} />
        </Dialog>
      </div>

      {stats && stats.total > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <StatCard icon={<Package className="h-3.5 w-3.5" />} label="Total" value={stats.total} />
          <StatCard icon={<CheckCircle2 className="h-3.5 w-3.5 text-success" />} label="OK" value={stats.ok} tone="success" />
          <StatCard icon={<XCircle className="h-3.5 w-3.5 text-destructive" />} label="Faltando" value={stats.missing} tone="destructive" />
          <StatCard icon={<Clock3 className="h-3.5 w-3.5 text-warning" />} label="Pendentes" value={pending} tone="warning" />
        </div>
      )}

      {rows === null ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : rows.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <FileText className="h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Nenhum inventário ainda.</p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const checked = r.ok + r.missing;
            const pct = r.total > 0 ? Math.round((checked / r.total) * 100) : 0;
            return (
              <li key={r.id}>
                <Card className="flex items-center gap-3 p-4 transition-shadow hover:shadow-md">
                  <Link to="/inventarios/$id" params={{ id: r.id }} className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.name}</div>
                        <div className="mt-0.5 text-xs text-muted-foreground">
                          {new Date(r.inventory_date + "T12:00:00").toLocaleDateString("pt-BR")} • turno {r.shift} • {checked}/{r.total}
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground" />
                    </div>
                    <SplitProgress total={r.total} ok={r.ok} missing={r.missing} className="mt-3" />
                    <div className="mt-1 flex items-center justify-between text-[11px]">
                      <span className="flex gap-2 text-muted-foreground">
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-success" />{r.ok}</span>
                        <span className="flex items-center gap-1"><span className="h-1.5 w-1.5 rounded-full bg-destructive" />{r.missing}</span>
                      </span>
                      <span className="font-medium text-primary">{pct}%</span>
                    </div>
                  </Link>
                  <Button variant="ghost" size="icon" onClick={() => remove(r.id)} aria-label="Apagar">
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function StatCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: number; tone?: "success" | "destructive" | "warning" }) {
  const toneCls =
    tone === "success" ? "border-success/30 bg-success/5"
    : tone === "destructive" ? "border-destructive/30 bg-destructive/5"
    : tone === "warning" ? "border-warning/30 bg-warning/5"
    : "";
  return (
    <Card className={`p-2.5 ${toneCls}`}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wide text-muted-foreground">
        {icon}{label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums">{value.toLocaleString("pt-BR")}</div>
    </Card>
  );
}

function NewInventoryDialog({ onCreated }: { onCreated: (id: string) => void }) {
  const [name, setName] = useState("");
  const [shift, setShift] = useState<"08:30" | "15:00" | "outro">("08:30");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) return toast.error("Selecione o arquivo");
    setBusy(true);
    try {
      const ext = file.name.toLowerCase().split(".").pop() ?? "";
      const items = ext === "xls" || ext === "xlsx"
        ? await parseInventoryXls(file)
        : await parseInventoryPdf(file);
      if (items.length === 0) throw new Error("Não consegui extrair cargas do arquivo. Confira o formato.");
      const now = new Date();
      const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Sessão expirou");
      const { data: inv, error } = await supabase
        .from("inventories")
        .insert({
          user_id: user.id,
          name: name.trim() || `Inventário ${today} ${shift}`,
          shift,
          inventory_date: today,
        })
        .select("id")
        .single();
      if (error || !inv) throw error;

      const rows = items.map((it) => ({ inventory_id: inv.id, ...it }));
      const { error: e2 } = await supabase.from("inventory_items").insert(rows);
      if (e2) throw e2;

      toast.success(`${items.length} cargas importadas`);
      onCreated(inv.id);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Erro ao importar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <DialogContent>
      <DialogHeader><DialogTitle>Novo inventário</DialogTitle></DialogHeader>
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label>Nome (opcional)</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Galpão 1 manhã" />
        </div>
        <div className="space-y-1.5">
          <Label>Turno</Label>
          <Select value={shift} onValueChange={(v) => setShift(v as any)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="08:30">08:30</SelectItem>
              <SelectItem value="15:00">15:00</SelectItem>
              <SelectItem value="outro">Outro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label>Arquivo do sistema (PDF, XLS ou XLSX)</Label>
          <Input
            type="file"
            accept=".pdf,.xls,.xlsx,application/pdf,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          <p className="text-xs text-muted-foreground">Recomendado: planilha (XLS/XLSX) — mais rápido e sem erros.</p>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Importando...</> : "Criar inventário"}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
