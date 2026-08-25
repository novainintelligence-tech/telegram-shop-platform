import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const initData = z.object({ initData: z.string().min(1).max(4096) });

export const miniappBootstrap = createServerFn({ method: "POST" })
  .inputValidator((data) => initData.parse(data))
  .handler(async ({ data }) => {
    const { bootstrap } = await import("./miniapp.server");
    return bootstrap(data.initData);
  });

export const miniappAddToCart = createServerFn({ method: "POST" })
  .inputValidator((data) => initData.extend({ productId: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { addItem } = await import("./miniapp.server");
    return addItem(data.initData, data.productId);
  });

export const miniappRemoveFromCart = createServerFn({ method: "POST" })
  .inputValidator((data) => initData.extend({ cartItemId: z.number().int().positive() }).parse(data))
  .handler(async ({ data }) => {
    const { removeItem } = await import("./miniapp.server");
    return removeItem(data.initData, data.cartItemId);
  });

export const miniappCheckout = createServerFn({ method: "POST" })
  .inputValidator((data) => initData.parse(data))
  .handler(async ({ data }) => {
    const { pay } = await import("./miniapp.server");
    return pay(data.initData);
  });

export const miniappTopUp = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    initData
      .extend({
        asset: z.enum(["BTC", "USDT_TRC20", "USDC_ERC20"]),
        amountUsd: z.number().positive().max(100000),
      })
      .parse(data),
  )
  .handler(async ({ data }) => {
    const { topUp } = await import("./miniapp.server");
    return topUp(data.initData, data.asset, data.amountUsd);
  });

export const miniappSubmitHash = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    initData.extend({ txId: z.number().int().positive(), hash: z.string().min(6).max(200) }).parse(data),
  )
  .handler(async ({ data }) => {
    const { submitHash } = await import("./miniapp.server");
    return submitHash(data.initData, data.txId, data.hash.trim());
  });
