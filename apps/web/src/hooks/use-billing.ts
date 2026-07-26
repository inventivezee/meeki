import { useQuery, useQueryClient } from "@tanstack/react-query";
import { jwtDecode } from "jwt-decode";
import { useCallback, useEffect, useState } from "react";

import {
  applyClientProGrant,
  type BillingInfo,
  deriveBillingInfo,
  parseProGrantEmails,
  type SupabaseJwtPayload,
} from "@hypr/supabase";

import { env } from "@/env";
import { getSupabaseBrowserClient } from "@/functions/supabase";

const DEFAULT_BILLING = deriveBillingInfo(
  applyClientProGrant(null, {
    forcePro: env.VITE_FORCE_PRO === true,
    grantEmails: parseProGrantEmails(env.VITE_PRO_GRANT_EMAILS),
  }),
);

export function useBilling() {
  const queryClient = useQueryClient();
  const [accessToken, setAccessToken] = useState<string | null | undefined>(
    undefined,
  );
  const [email, setEmail] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    void supabase.auth.getSession().then(({ data }) => {
      setAccessToken(data.session?.access_token ?? null);
      setEmail(data.session?.user.email ?? null);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setAccessToken(session?.access_token ?? null);
      setEmail(session?.user.email ?? null);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  const jwtQuery = useQuery({
    queryKey: [
      "billing",
      "jwt",
      accessToken ?? "",
      email ?? "",
      env.VITE_FORCE_PRO ?? false,
      env.VITE_PRO_GRANT_EMAILS ?? "",
    ],
    queryFn: async () => {
      if (!accessToken) {
        return deriveBillingInfo(
          applyClientProGrant(null, {
            forcePro: env.VITE_FORCE_PRO === true,
            grantEmails: parseProGrantEmails(env.VITE_PRO_GRANT_EMAILS),
            email,
          }),
        );
      }

      const payload = jwtDecode<SupabaseJwtPayload>(accessToken);
      return deriveBillingInfo(
        applyClientProGrant(payload, {
          forcePro: env.VITE_FORCE_PRO === true,
          grantEmails: parseProGrantEmails(env.VITE_PRO_GRANT_EMAILS),
          email: email ?? payload.email,
        }),
      );
    },
    enabled: accessToken !== undefined,
    retry: false,
  });

  const billing: BillingInfo = jwtQuery.data ?? DEFAULT_BILLING;
  const isReady = accessToken !== undefined && !jwtQuery.isPending;
  const isVerified = isReady;

  const refreshBilling = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    const { data } = await supabase.auth.refreshSession();
    setAccessToken(data.session?.access_token ?? null);
    await queryClient.invalidateQueries({ queryKey: ["billing"] });
  }, [queryClient]);

  return {
    ...billing,
    isReady,
    isVerified,
    refreshBilling,
  };
}
