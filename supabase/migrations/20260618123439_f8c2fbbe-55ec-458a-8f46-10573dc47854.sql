
CREATE POLICY "analysts see all inventories" ON public.inventories
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'analyst'));

CREATE POLICY "analysts see all items" ON public.inventory_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'analyst'));

CREATE POLICY "analysts see all extras" ON public.extra_items
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'analyst'));
