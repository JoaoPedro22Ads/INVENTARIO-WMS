import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export type AppRole = "admin" | "analyst" | "user";

export function useUserRole() {
  const { user } = useAuth();
  const [roles, setRoles] = useState<AppRole[] | null>(null);

  useEffect(() => {
    if (!user) { setRoles([]); return; }
    let cancel = false;
    (async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      if (!cancel) setRoles(((data ?? []) as { role: AppRole }[]).map(r => r.role));
    })();
    return () => { cancel = true; };
  }, [user]);

  const isAdmin = roles === null ? null : roles.includes("admin");
  const isAnalyst = roles === null ? null : roles.includes("analyst");
  const canViewAdmin = roles === null ? null : (roles.includes("admin") || roles.includes("analyst"));
  // Analysts are read-only and must not access inventories
  const canViewInventories = roles === null ? null : !roles.includes("analyst") || roles.includes("admin");

  return { roles, isAdmin, isAnalyst, canViewAdmin, canViewInventories };
}
