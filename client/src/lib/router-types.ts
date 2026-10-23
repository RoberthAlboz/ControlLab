import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import type { AppRouter } from "../../../server/routers";

export type RouterOutputs = inferRouterOutputs<AppRouter>;
export type RouterInputs = inferRouterInputs<AppRouter>;

export type InventorySummary = RouterOutputs["inventory"]["summary"];
export type InventoryItemRow = RouterOutputs["inventory"]["items"]["list"]["items"][number];
export type InventoryItemDetail = RouterOutputs["inventory"]["items"]["detail"];
export type InventoryMovementRow = RouterOutputs["inventory"]["movements"]["list"]["movements"][number];
export type InventoryLoanRow = RouterOutputs["inventory"]["loans"]["list"]["loans"][number];
export type InventoryOptions = RouterOutputs["inventory"]["options"];
export type LinkableItem = RouterOutputs["inventory"]["items"]["linkable"][number];
