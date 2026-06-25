import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck,
  ShieldCheck,
  Lock,
  Database,
  Users,
  Cookie,
  Trash2,
  Mail,
  Server,
} from "lucide-react";

export const Route = createFileRoute("/trust")({
  component: TrustPage,
  head: () => ({
    meta: [
      { title: "Confiança e Segurança · Inventário WMS" },
      {
        name: "description",
        content:
          "Práticas de segurança, privacidade e tratamento de dados do Inventário WMS.",
      },
    ],
  }),
});

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="rounded-lg bg-primary/10 p-2">
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <h2 className="text-lg font-semibold">{title}</h2>
      </div>
      <div className="mt-3 space-y-2 text-sm text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function TrustPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background to-accent/30">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
        <Link to="/" className="flex items-center gap-2 font-semibold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Inventário WMS
        </Link>
        <Link to="/login">
          <Button variant="ghost" size="sm">
            Entrar
          </Button>
        </Link>
      </header>

      <main className="mx-auto max-w-5xl px-6 pt-6 pb-24">
        <div className="mb-8">
          <div className="inline-flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-primary" />
            Confiança & Segurança
          </div>
          <h1 className="mt-4 text-3xl font-bold tracking-tight md:text-4xl">
            Como tratamos seus dados
          </h1>
          <p className="mt-3 max-w-2xl text-sm text-muted-foreground">
            Esta página é mantida pelo responsável do Inventário WMS para
            responder perguntas comuns sobre segurança e privacidade. O conteúdo
            descreve controles ativos no aplicativo e não constitui uma
            certificação independente.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <Section icon={Lock} title="Autenticação e acesso">
            <p>
              O acesso exige conta e senha individuais. Sessões são gerenciadas
              por tokens emitidos no login e revalidados a cada requisição
              sensível.
            </p>
            <p>
              Controle de acesso baseado em papéis (admin, analista, usuário)
              restringe as áreas administrativas e somente leitura.
            </p>
          </Section>

          <Section icon={Server} title="Infraestrutura">
            <p>
              O aplicativo é executado em infraestrutura serverless gerenciada,
              com banco de dados Postgres hospedado em provedor de nuvem. A
              comunicação entre navegador e servidor usa HTTPS.
            </p>
          </Section>

          <Section icon={Database} title="Dados coletados">
            <p>
              Coletamos apenas o necessário para operar o inventário: e-mail e
              nome de exibição da conta, e os dados de inventário enviados pelo
              usuário (PDFs, planilhas e itens conferidos).
            </p>
          </Section>

          <Section icon={Users} title="Quem pode ver o quê">
            <p>
              Cada usuário acessa apenas os próprios inventários. Administradores
              e analistas autorizados podem visualizar dados agregados para fins
              operacionais; analistas têm permissão somente de leitura.
            </p>
            <p>Regras são aplicadas no banco via políticas de linha (RLS).</p>
          </Section>

          <Section icon={Cookie} title="Cookies e telemetria">
            <p>
              Usamos armazenamento local do navegador para manter a sessão
              autenticada. Não utilizamos cookies publicitários nem
              rastreadores de terceiros.
            </p>
          </Section>

          <Section icon={Trash2} title="Retenção e exclusão">
            <p>
              Inventários permanecem disponíveis enquanto sua conta estiver
              ativa. Para solicitar exclusão de dados ou da conta, entre em
              contato pelo canal abaixo.
            </p>
          </Section>

          <Section icon={Mail} title="Contato de segurança">
            <p>
              Para relatar uma vulnerabilidade ou solicitação relacionada à
              privacidade, escreva para o responsável pela operação do
              aplicativo. As respostas são tratadas em ordem de chegada.
            </p>
          </Section>

          <Section icon={ShieldCheck} title="Responsabilidades compartilhadas">
            <p>
              A plataforma fornece hospedagem, banco e autenticação gerenciados.
              O responsável pelo aplicativo define regras de acesso, conteúdo e
              uso. Os usuários são responsáveis pela proteção das próprias
              credenciais.
            </p>
          </Section>
        </div>

        <p className="mt-8 text-xs text-muted-foreground">
          Esta página é conteúdo editável do aplicativo. Última revisão pelo
          responsável do produto.
        </p>
      </main>
    </div>
  );
}
