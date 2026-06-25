-- Allow admins to delete/update any inventory and its children
CREATE POLICY "admins delete any inventory" ON public.inventories
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete any item" ON public.inventory_items
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admins delete any extra" ON public.extra_items
  FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));

-- Remove the stuck inventory and its children
DELETE FROM public.inventory_items WHERE inventory_id = '9b27a2c2-1b32-4bee-9ed7-1379c18b6b13';
DELETE FROM public.extra_items WHERE inventory_id = '9b27a2c2-1b32-4bee-9ed7-1379c18b6b13';
DELETE FROM public.inventories WHERE id = '9b27a2c2-1b32-4bee-9ed7-1379c18b6b13';