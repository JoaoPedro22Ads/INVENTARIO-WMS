-- 1. Create private schema (not exposed by PostgREST)
CREATE SCHEMA IF NOT EXISTS private;

-- 2. Recreate has_role inside private schema
CREATE OR REPLACE FUNCTION private.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id AND role = _role
  )
$$;

REVOKE ALL ON FUNCTION private.has_role(uuid, public.app_role) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.has_role(uuid, public.app_role) TO authenticated, service_role;

-- 3. Recreate all policies that referenced public.has_role to use private.has_role
-- user_roles
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins see all roles" ON public.user_roles;
CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE AND private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE AND private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING ((auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE AND private.has_role(auth.uid(), 'admin'::public.app_role));

-- extra_items
DROP POLICY IF EXISTS "admins delete any extra" ON public.extra_items;
DROP POLICY IF EXISTS "admins see all extras" ON public.extra_items;
DROP POLICY IF EXISTS "analysts see all extras" ON public.extra_items;
CREATE POLICY "admins delete any extra" ON public.extra_items
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all extras" ON public.extra_items
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "analysts see all extras" ON public.extra_items
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'analyst'::public.app_role));

-- inventories
DROP POLICY IF EXISTS "admins delete any inventory" ON public.inventories;
DROP POLICY IF EXISTS "admins see all inventories" ON public.inventories;
DROP POLICY IF EXISTS "admins update any inventory" ON public.inventories;
DROP POLICY IF EXISTS "analysts see all inventories" ON public.inventories;
CREATE POLICY "admins delete any inventory" ON public.inventories
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all inventories" ON public.inventories
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins update any inventory" ON public.inventories
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'::public.app_role))
  WITH CHECK (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "analysts see all inventories" ON public.inventories
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'analyst'::public.app_role));

-- inventory_items
DROP POLICY IF EXISTS "admins delete any item" ON public.inventory_items;
DROP POLICY IF EXISTS "admins see all items" ON public.inventory_items;
DROP POLICY IF EXISTS "analysts see all items" ON public.inventory_items;
CREATE POLICY "admins delete any item" ON public.inventory_items
  FOR DELETE TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "admins see all items" ON public.inventory_items
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'admin'::public.app_role));
CREATE POLICY "analysts see all items" ON public.inventory_items
  FOR SELECT TO authenticated USING (private.has_role(auth.uid(), 'analyst'::public.app_role));

-- 4. Drop the public has_role now that nothing depends on it
DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);