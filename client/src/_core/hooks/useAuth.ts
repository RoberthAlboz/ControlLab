import { trpc } from "@/lib/trpc";
import { isStaffRole } from "@shared/roles";
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

  const logout = useCallback(async () => {
    try {
      await logoutMutation.mutateAsync();
    } finally {
      // Remove dados da sessão anterior (inclusive estoque) antes de sair.
      utils.auth.me.setData(undefined, null);
      await utils.invalidate();
    }
  }, [logoutMutation, utils]);

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
