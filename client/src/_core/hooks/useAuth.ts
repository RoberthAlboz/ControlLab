import { trpc } from "@/lib/trpc";
import { isStaffRole } from "@shared/roles";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo } from "react";

/**
 * Estado de autenticação do navegador. A fonte da verdade é `auth.me`, que o
 * servidor responde a partir do cookie httpOnly de sessão.
 */
export function useAuth() {
  const utils = trpc.useUtils();
  const meQuery = trpc.auth.me.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 60_000,
  });

  const logoutMutation = trpc.auth.logout.useMutation();
  const queryClient = useQueryClient();

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      // Apaga todo o cache da sessão anterior (estoque, anotações, catálogo):
      // a próxima conta nesta aba nunca vê nem edita dados de outra pessoa.
      queryClient.removeQueries();
      utils.auth.me.setData(undefined, null);
    }
  }, [logoutMutation, queryClient, utils]);

  return useMemo(
    () => ({
      user: meQuery.data ?? null,
      loading: meQuery.isLoading,
      checking: meQuery.isFetching,
      error: meQuery.error ?? null,
      isAuthenticated: Boolean(meQuery.data),
      isStaff: isStaffRole(meQuery.data?.role),
      loggingOut: logoutMutation.isPending,
      refresh: () => meQuery.refetch(),
      logout,
    }),
    [logout, logoutMutation.isPending, meQuery],
  );
}
