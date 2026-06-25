import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ClipboardCheck } from "lucide-react";
import { fetchUserRoles, landingPathForRoles } from "@/lib/user-roles";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) {
      fetchUserRoles(user.id).then((roles) => nav({ to: landingPathForRoles(roles) }));
    }
  }, [user, loading, nav]);

  async function signIn(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error || !data.user) {
      console.error("signIn failed", error);
      toast.error("Email ou senha incorretos.");
    } else {
      const roles = await fetchUserRoles(data.user.id);
      nav({ to: landingPathForRoles(roles) });
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-background to-accent/30 px-4">
      <div className="w-full max-w-sm">
        <Link to="/" className="mb-6 flex items-center justify-center gap-2 font-semibold">
          <ClipboardCheck className="h-5 w-5 text-primary" />
          Inventário WMS
        </Link>

        <div className="rounded-2xl border bg-card p-6 shadow-sm">
          <h1 className="mb-4 text-lg font-semibold">Entrar</h1>
          <form onSubmit={signIn} className="space-y-3">
            <div className="space-y-1.5">
              <Label>Email</Label>
              <Input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Senha</Label>
              <Input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? "Entrando..." : "Entrar"}
            </Button>
            <p className="pt-2 text-center text-xs text-muted-foreground">
              Acesso restrito. Solicite credenciais ao administrador.
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
