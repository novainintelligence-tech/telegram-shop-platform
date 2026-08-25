/** USD price lookup for supported assets using free public endpoints. */

export type PaymentAsset = "BTC" | "USDT_TRC20" | "USDC_ERC20";

export const ASSET_LABEL: Record<PaymentAsset, string> = {
  BTC: "Bitcoin (BTC)",
  USDT_TRC20: "USDT (TRC20 / TRON)",
  USDC_ERC20: "USDC (Ethereum ERC20)",
};

export const ASSET_NETWORK: Record<PaymentAsset, string> = {
  BTC: "Bitcoin mainnet",
  USDT_TRC20: "TRON (TRC20)",
  USDC_ERC20: "Ethereum mainnet (ERC20)",
};

export const ASSET_DECIMALS: Record<PaymentAsset, number> = {
  BTC: 8,
  USDT_TRC20: 2,
  USDC_ERC20: 2,
};

/** Returns how many USD one unit of the asset is worth. */
export async function getUsdPrice(asset: PaymentAsset): Promise<number> {
  if (asset !== "BTC") return 1;
  try {
    const res = await fetch("https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd");
    if (res.ok) {
      const data = (await res.json()) as { bitcoin?: { usd?: number } };
      const price = data.bitcoin?.usd;
      if (typeof price === "number" && price > 0) return price;
    }
  } catch (error) {
    console.error("[rates] coingecko failed", error);
  }
  try {
    const res = await fetch("https://mempool.space/api/v1/prices");
    if (res.ok) {
      const data = (await res.json()) as { USD?: number };
      if (typeof data.USD === "number" && data.USD > 0) return data.USD;
    }
  } catch (error) {
    console.error("[rates] mempool prices failed", error);
  }
  throw new Error("Unable to fetch BTC price right now. Please try again in a moment.");
}

export function formatAmount(amount: number, asset: PaymentAsset): string {
  return amount.toFixed(ASSET_DECIMALS[asset]);
}