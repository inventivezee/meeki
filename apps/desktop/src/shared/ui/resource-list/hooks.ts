import { useQuery } from "@tanstack/react-query";

import { env } from "~/env";

/**
 * Optional remote suggestions. Disabled unless VITE_RESOURCE_SUGGESTIONS_URL is set
 * so Meeki does not phone home to meeki.so by default.
 */
export function useWebResources<T>(endpoint: string) {
  const baseUrl = env.VITE_RESOURCE_SUGGESTIONS_URL?.replace(/\/$/, "");

  return useQuery({
    queryKey: ["settings", endpoint, "suggestions", baseUrl ?? ""],
    enabled: !!baseUrl,
    queryFn: async () => {
      if (!baseUrl) {
        return [];
      }
      const response = await fetch(`${baseUrl}/${endpoint}`, {
        headers: { Accept: "application/json" },
      });
      if (!response.ok) {
        return [];
      }
      return response.json() as Promise<T[]>;
    },
  });
}
