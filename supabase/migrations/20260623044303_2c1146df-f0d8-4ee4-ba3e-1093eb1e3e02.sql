
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

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

DROP POLICY IF EXISTS "Admins can manage news" ON public.visa_news;
CREATE POLICY "Admins can manage news" ON public.visa_news
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage feature flags" ON public.feature_flags;
CREATE POLICY "Admins can manage feature flags" ON public.feature_flags
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" ON public.profiles
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all profiles" ON public.profiles;
CREATE POLICY "Admins can view all profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage roles" ON public.user_roles;
CREATE POLICY "Admins can manage roles" ON public.user_roles
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "Admins can view all roles" ON public.user_roles
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Block non-admin role inserts" ON public.user_roles;
CREATE POLICY "Block non-admin role inserts" ON public.user_roles
  AS RESTRICTIVE
  FOR INSERT TO authenticated, anon
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all calculations" ON public.visa_score_calculations;
CREATE POLICY "Admins can view all calculations" ON public.visa_score_calculations
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage weights" ON public.visa_score_weights;
CREATE POLICY "Admins can manage weights" ON public.visa_score_weights
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update payments" ON public.payments;
CREATE POLICY "Admins can update payments" ON public.payments
  FOR UPDATE TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can view all payments" ON public.payments;
CREATE POLICY "Admins can view all payments" ON public.payments
  FOR SELECT TO authenticated
  USING (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage country configs" ON public.visa_country_configs;
CREATE POLICY "Admins can manage country configs" ON public.visa_country_configs
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage itineraries" ON public.itineraries;
CREATE POLICY "Admins can manage itineraries" ON public.itineraries
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can manage events" ON public.upcoming_events;
CREATE POLICY "Admins can manage events" ON public.upcoming_events
  FOR ALL TO authenticated
  USING (private.has_role(auth.uid(), 'admin'))
  WITH CHECK (private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can delete itineraries" ON storage.objects;
CREATE POLICY "Admins can delete itineraries" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'itineraries' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can update itineraries" ON storage.objects;
CREATE POLICY "Admins can update itineraries" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'itineraries' AND private.has_role(auth.uid(), 'admin'))
  WITH CHECK (bucket_id = 'itineraries' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Admins can upload itineraries" ON storage.objects;
CREATE POLICY "Admins can upload itineraries" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'itineraries' AND private.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "Anyone can view itineraries" ON storage.objects;
CREATE POLICY "Authenticated users can view itineraries" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'itineraries');

DROP FUNCTION IF EXISTS public.has_role(uuid, public.app_role);
