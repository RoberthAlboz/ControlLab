import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from "@shared/const";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, httpLink, splitLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { LOGIN_PATH, loginUrl } from "./const";
// A ordem importa: cada folha pode sobrescrever as anteriores (ver client/src/styles/).
import "./styles/index.css";
import "./styles/forge-editorial.css";
import "./styles/forge-platform.css";
import "./styles/sidebar.css";
import "./styles/header.css";
import "./styles/profile.css";
import "./styles/student.css";
import "./styles/teacher-modal.css";
import "./styles/notes.css";
import "./styles/library.css";
import "./styles/reader.css";
import "./styles/teacher.css";
import "./styles/quiz.css";
import "./styles/theme-ux.css";
import "./styles/workshop.css";
import "./styles/dashboard-home.css";
import "./styles/app-screens.css";

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

const withCredentials = (input: RequestInfo | URL, init?: RequestInit) =>
  globalThis.fetch(input, { ...(init ?? {}), credentials: "include" });

/**
 * Chamadas com imagens em base64 vão sozinhas (sem lote): o servidor só aceita
 * corpo grande quando a requisição contém apenas essas chamadas.
 */
const LARGE_UPLOAD_PATHS = new Set(["learning.saveModule", "profile.uploadAvatar"]);

const trpcClient = trpc.createClient({
  links: [
    splitLink({
      condition: op => LARGE_UPLOAD_PATHS.has(op.path),
      true: httpLink({ url: "/api/trpc", transformer: superjson, fetch: withCredentials }),
      false: httpBatchLink({ url: "/api/trpc", transformer: superjson, fetch: withCredentials }),
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
