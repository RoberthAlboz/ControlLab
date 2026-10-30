/**
 * Rotas da área de estoque: qual aba e qual visão de itens cada endereço abre.
 * Sem React, para que a regra possa ser testada isoladamente.
 */
export type InventoryTab =
  | "itens"
  | "emprestimos"
  | "movimentacoes"
  | "categorias";
export type ItemsView = "lista" | "painel";

export const INVENTORY_PATHS: Record<InventoryTab, string> = {
  itens: "/estoque",
  emprestimos: "/estoque/emprestimos",
  movimentacoes: "/estoque/movimentacoes",
  categorias: "/estoque/categorias",
};

export const BOARD_PATH = "/estoque/painel";

const withoutTrailingSlash = (path: string) => path.replace(/\/+$/, "");

/** Aba aberta por um endereço; endereços desconhecidos (inclusive o painel) caem em Itens. */
export function tabFromPath(path: string): InventoryTab {
  const clean = withoutTrailingSlash(path);
  const found = (Object.keys(INVENTORY_PATHS) as InventoryTab[]).find(
    tab => INVENTORY_PATHS[tab] === clean
  );
  return found ?? "itens";
}

export function itemsViewFromPath(path: string): ItemsView {
  return withoutTrailingSlash(path) === BOARD_PATH ? "painel" : "lista";
}

export function pathForItemsView(view: ItemsView) {
  return view === "painel" ? BOARD_PATH : INVENTORY_PATHS.itens;
}
