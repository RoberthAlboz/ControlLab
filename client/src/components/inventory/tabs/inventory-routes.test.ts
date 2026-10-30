import { describe, expect, it } from "vitest";
import {
  BOARD_PATH,
  INVENTORY_PATHS,
  itemsViewFromPath,
  pathForItemsView,
  tabFromPath,
} from "./inventory-routes";

describe("rotas do estoque", () => {
  it("cada aba abre pelo próprio endereço, com ou sem barra final", () => {
    for (const [tab, path] of Object.entries(INVENTORY_PATHS)) {
      expect(tabFromPath(path)).toBe(tab);
      expect(tabFromPath(`${path}/`)).toBe(tab);
    }
  });

  it("o painel e endereços desconhecidos ficam na aba Itens", () => {
    expect(tabFromPath(BOARD_PATH)).toBe("itens");
    expect(tabFromPath("/estoque/qualquer")).toBe("itens");
  });

  it("visão de itens: lista ou painel, ida e volta", () => {
    expect(itemsViewFromPath(BOARD_PATH)).toBe("painel");
    expect(itemsViewFromPath("/estoque")).toBe("lista");
    expect(itemsViewFromPath(pathForItemsView("painel"))).toBe("painel");
    expect(itemsViewFromPath(pathForItemsView("lista"))).toBe("lista");
  });
});
