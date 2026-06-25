-- extra_items
DROP POLICY IF EXISTS "admins delete any extra" ON public.extra_items;
DROP POLICY IF EXISTS "admins see all extras" ON public.extra_items;
DROP POLICY IF EXISTS "analysts see all extras" ON public.extra_items;
DROP POLICY IF EXISTS "extras_all_own" ON public.extra_items;

CREATE POLICY "admins delete any extra" ON public.extra_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all extras" ON public.extra_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "analysts see all extras" ON public.extra_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'::public.app_role));
CREATE POLICY "extras_all_own" ON public.extra_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventories i WHERE i.id = extra_items.inventory_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventories i WHERE i.id = extra_items.inventory_id AND i.user_id = auth.uid()));

-- inventories
DROP POLICY IF EXISTS "admins delete any inventory" ON public.inventories;
DROP POLICY IF EXISTS "admins see all inventories" ON public.inventories;
DROP POLICY IF EXISTS "admins update any inventory" ON public.inventories;
DROP POLICY IF EXISTS "analysts see all inventories" ON public.inventories;
DROP POLICY IF EXISTS "inv_delete_own" ON public.inventories;
DROP POLICY IF EXISTS "inv_insert_own" ON public.inventories;
DROP POLICY IF EXISTS "inv_select_own" ON public.inventories;
DROP POLICY IF EXISTS "inv_update_own" ON public.inventories;

CREATE POLICY "admins delete any inventory" ON public.inventories
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all inventories" ON public.inventories
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update any inventory" ON public.inventories
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "analysts see all inventories" ON public.inventories
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'::public.app_role));
CREATE POLICY "inv_delete_own" ON public.inventories
  FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "inv_insert_own" ON public.inventories
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "inv_select_own" ON public.inventories
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "inv_update_own" ON public.inventories
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

-- inventory_items
DROP POLICY IF EXISTS "admins delete any item" ON public.inventory_items;
DROP POLICY IF EXISTS "admins see all items" ON public.inventory_items;
DROP POLICY IF EXISTS "analysts see all items" ON public.inventory_items;
DROP POLICY IF EXISTS "items_all_own" ON public.inventory_items;

CREATE POLICY "admins delete any item" ON public.inventory_items
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all items" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "analysts see all items" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'analyst'::public.app_role));
CREATE POLICY "items_all_own" ON public.inventory_items
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.inventories i WHERE i.id = inventory_items.inventory_id AND i.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.inventories i WHERE i.id = inventory_items.inventory_id AND i.user_id = auth.uid()));

-- profiles
DROP POLICY IF EXISTS "profiles_select_all" ON public.profiles;
DROP POLICY IF EXISTS "profiles_update_own" ON public.profiles;
DROP POLICY IF EXISTS "profiles_insert_own" ON public.profiles;

CREATE POLICY "profiles_select_all" ON public.profiles
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "profiles_update_own" ON public.profiles
  FOR UPDATE TO authenticated USING (auth.uid() = id) WITH CHECK (auth.uid() = id);
CREATE POLICY "profiles_insert_own" ON public.profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);