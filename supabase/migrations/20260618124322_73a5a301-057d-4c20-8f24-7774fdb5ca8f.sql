DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
DROP POLICY IF EXISTS "admins see all roles" ON public.user_roles;
DROP POLICY IF EXISTS "users see own roles" ON public.user_roles;

CREATE POLICY "admins manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (
    (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  )
  WITH CHECK (
    (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "admins see all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
    AND public.has_role(auth.uid(), 'admin'::public.app_role)
  );

CREATE POLICY "users see own roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    (auth.jwt() ->> 'is_anonymous')::boolean IS NOT TRUE
    AND auth.uid() = user_id
  );