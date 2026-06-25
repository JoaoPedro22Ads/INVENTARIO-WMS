import { supabase } from "@/integrations/supabase/client";

export type AppRole = "admin" | "analyst" | "user";

export async function fetchUserRoles(userId: string): Promise<AppRole[]> {
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  return ((data ?? []) as { role: AppRole }[]).map((r) => r.role);
}

export function landingPathForRoles(roles: AppRole[]): "/admin" | "/dashboard" {
  // Analysts are read-only and only see the Admin panel
  if (roles.includes("analyst") && !roles.includes("admin")) return "/admin";
  return "/dashboard";
}
