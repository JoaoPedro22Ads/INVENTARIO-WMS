import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, ScanBarcode, FileText, ChartBar } from "lucide-react";
import { fetchUserRoles, landingPathForRoles } from "@/lib/user-roles";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { user, loading } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && user) {
      fetchUserRoles(user.id).then((roles) => nav({ to: landingPathForRoles(roles) }));
    }
  }, [user, loading, nav]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/30">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <div className="flex items-center gap-2 font-semibold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Inventário WMS
        </div>
        <Link to="/login">
          <Button variant="ghost" size="sm">Entrar</Button>
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-10 pb-24">
        <h1 className="text-4xl font-bold leading-tight tracking-tight md:text-5xl">
          Inventário do galpão,<br />
          <span className="text-primary">no seu bolso.</span>
        </h1>
        <p className="mt-4 max-w-xl text-base text-muted-foreground md:text-lg">
          Suba o PDF da empresa, conferi cada carga pelo celular, veja quanto falta em tempo real
          e anote o que aparece fora do sistema. Sem papel, sem perder nota.
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/login">
            <Button size="lg">Começar agora</Button>
          </Link>
        </div>

        <div className="mt-16 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            { icon: FileText, t: "Importa do PDF", d: "Lê o PDF da empresa e gera a lista pronta." },
            { icon: ScanBarcode, t: "Confere rápido", d: "Busca por NF, CT-e ou endereço em segundos." },
            { icon: ChartBar, t: "Progresso ao vivo", d: "Barra de % e quanto falta por local." },
            { icon: ClipboardCheck, t: "Cargas extras", d: "Anote físico que não está no sistema." },
          ].map((f) => (
            <div key={f.t} className="rounded-xl border bg-card p-5 shadow-sm">
              <f.icon className="h-6 w-6 text-primary" />
              <h3 className="mt-3 font-semibold">{f.t}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{f.d}</p>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
