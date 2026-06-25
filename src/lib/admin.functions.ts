import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const renameSchema = z.object({
  inventory_id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export const renameInventoryAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => renameSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Re-verify admin role on the server. Do NOT trust client-side checks.
    const { data: roleRow, error: roleErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();

    if (roleErr) {
      console.error("renameInventoryAdmin role check failed", roleErr);
      throw new Response("Forbidden", { status: 403 });
    }
    if (!roleRow) {
      throw new Response("Forbidden", { status: 403 });
    }

    const { error } = await supabase
      .from("inventories")
      .update({ name: data.name })
      .eq("id", data.inventory_id);

    if (error) {
      console.error("renameInventoryAdmin update failed", error);
      throw new Response("Update failed", { status: 500 });
    }

    return { ok: true, name: data.name };
  });
