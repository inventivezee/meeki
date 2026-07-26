-- Comp / admin Pro grants without Stripe.
-- Seed with: INSERT INTO private.pro_grants (email) VALUES ('you@example.com');

CREATE TABLE IF NOT EXISTS private.pro_grants (
  email text PRIMARY KEY,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT pro_grants_email_lowercase CHECK (email = lower(email))
);

COMMENT ON TABLE private.pro_grants IS
  'Emails that receive hyprnote_pro in JWT claims without a Stripe entitlement.';

ALTER TABLE private.pro_grants ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE private.pro_grants FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE private.pro_grants TO supabase_auth_admin;
GRANT ALL ON TABLE private.pro_grants TO service_role;

GRANT USAGE ON SCHEMA private TO supabase_auth_admin;
GRANT SELECT ON TABLE auth.users TO supabase_auth_admin;

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
  claims jsonb;
  entitlements jsonb := '[]'::jsonb;
  v_user_id uuid := (event->>'user_id')::uuid;
  v_customer_id text;
  v_subscription_status text;
  v_trial_end bigint;
  v_has_payment_method boolean;
  v_email text;
BEGIN
  SELECT p.stripe_customer_id INTO v_customer_id
  FROM public.profiles p
  WHERE p.id = v_user_id;

  SELECT
    COALESCE(
      jsonb_agg(ae.lookup_key ORDER BY ae.lookup_key)
        FILTER (WHERE ae.lookup_key IS NOT NULL),
      '[]'::jsonb
    )
  INTO entitlements
  FROM public.profiles p
  JOIN stripe.active_entitlements ae
    ON ae.customer = p.stripe_customer_id
  WHERE p.id = v_user_id;

  SELECT lower(u.email) INTO v_email
  FROM auth.users u
  WHERE u.id = v_user_id;

  IF v_email IS NOT NULL AND EXISTS (
    SELECT 1
    FROM private.pro_grants g
    WHERE g.email = v_email
  ) AND NOT (entitlements @> '["hyprnote_pro"]'::jsonb) THEN
    entitlements := entitlements || '["hyprnote_pro"]'::jsonb;
  END IF;

  IF v_customer_id IS NOT NULL THEN
    SELECT
      s.status::text,
      (s.trial_end #>> '{}')::bigint,
      s.default_payment_method IS NOT NULL
        OR c.invoice_settings->>'default_payment_method' IS NOT NULL
        OR c.default_source IS NOT NULL
    INTO v_subscription_status, v_trial_end, v_has_payment_method
    FROM stripe.subscriptions s
    JOIN stripe.customers c ON c.id = s.customer
    WHERE s.customer = v_customer_id
      AND s.status IN ('trialing', 'active')
    ORDER BY
      CASE s.status WHEN 'active' THEN 1 WHEN 'trialing' THEN 2 END,
      s.created DESC
    LIMIT 1;
  END IF;

  claims := event->'claims';
  claims := jsonb_set(claims, '{entitlements}', entitlements);

  IF v_subscription_status IS NOT NULL THEN
    claims := jsonb_set(claims, '{subscription_status}', to_jsonb(v_subscription_status));
  END IF;

  IF v_trial_end IS NOT NULL THEN
    claims := jsonb_set(claims, '{trial_end}', to_jsonb(v_trial_end));
  END IF;

  IF v_has_payment_method IS NOT NULL THEN
    claims := jsonb_set(claims, '{has_payment_method}', to_jsonb(v_has_payment_method));
  END IF;

  event := jsonb_set(event, '{claims}', claims);

  RETURN event;
END;
$$;

REVOKE ALL ON FUNCTION public.custom_access_token_hook(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
