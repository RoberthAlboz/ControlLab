import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { LOGIN_PATH, loginUrl } from "./const";
import "./index.css";
import "./forge-editorial.css";
import "./forge-platform.css";
import "./sidebar.css";
import "./header.css";
import "./profile.css";
import "./student.css";
import "./teacher-modal.css";
import "./notes.css";
import "./library.css";
import "./reader.css";
import "./teacher.css";
import "./theme-ux.css";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Erros de permissão/sessão não melhoram com novas tentativas.
      retry: (failureCount, error) => {
        if (error instanceof TRPCClientError && ["UNAUTHORIZED", "FORBIDDEN", "NOT_FOUND", "BAD_REQUEST"].includes(error.data?.code)) return false;
        return failureCount < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Sessão expirada ou revogada durante o uso: limpa o usuário em cache e leva à
 * tela de login preservando a página atual.
 */
const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;
  if (error.message !== UNAUTHED_ERR_MSG && error.data?.code !== "UNAUTHORIZED") return;
  if (window.location.pathname.startsWith(LOGIN_PATH)) return;
  // Credenciais inválidas no próprio formulário de login não redirecionam.
  if (error.data?.path === "auth.login") return;
  window.location.assign(loginUrl());
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.query.state.error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    redirectToLoginIfUnauthorized(event.mutation.state.error);
  }
});

const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/api/trpc",
      transformer: superjson,
      fetch(input, init) {
        return globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });
      },
    }),
  ],
});

createRoot(document.getElementById("root")!).render(
  <trpc.Provider client={trpcClient} queryClient={queryClient}>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </trpc.Provider>
);
