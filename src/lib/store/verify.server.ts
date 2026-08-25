/**
 * On-chain verification of a submitted transaction hash against the store's
 * receiving addresses. Uses free public endpoints only.
 */
import type { PaymentAsset } from "./rates.server";

export type VerifyResult = {
  found: boolean;
  paid: number; // amount received by our address, in asset units
  confirmations: number;
  note: string;
};

const USDT_TRC20_CONTRACT = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t";
const USDC_ERC20_CONTRACT = "0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48";
const TRANSFER_TOPIC = "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";

const ETH_RPCS = [
  "https://ethereum-rpc.publicnode.com",
  "https://eth.llamarpc.com",
  "https://rpc.ankr.com/eth",
];

async function getJson(url: string, init?: RequestInit): Promise<unknown | null> {
  try {
    const res = await fetch(url, {
      ...init,
      headers: { "User-Agent": "lovable-store-bot", ...(init?.headers ?? {}) },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch (error) {
    console.error("[verify] request failed", url, error);
    return null;
  }
}

export function isPlausibleHash(asset: PaymentAsset, hash: string): boolean {
  const value = hash.trim();
  if (asset === "USDC_ERC20") return /^0x[0-9a-fA-F]{64}$/.test(value);
  return /^(0x)?[0-9a-fA-F]{64}$/.test(value);
}

async function verifyBtc(hash: string, address: string): Promise<VerifyResult> {
  const tx = (await getJson(`https://mempool.space/api/tx/${encodeURIComponent(hash)}`)) as
    | { vout?: { scriptpubkey_address?: string; value?: number }[]; status?: { confirmed?: boolean; block_height?: number } }
    | null;
  if (!tx || !Array.isArray(tx.vout)) {
    return { found: false, paid: 0, confirmations: 0, note: "Transaction not found on the Bitcoin network yet." };
  }
  const sats = tx.vout
    .filter((out) => (out.scriptpubkey_address ?? "").toLowerCase() === address.toLowerCase())
    .reduce((sum, out) => sum + (out.value ?? 0), 0);
  let confirmations = 0;
  if (tx.status?.confirmed) {
    const tip = (await getJson("https://mempool.space/api/blocks/tip/height")) as number | null;
    confirmations = typeof tip === "number" && tx.status.block_height ? tip - tx.status.block_height + 1 : 1;
  }
  return {
    found: sats > 0,
    paid: sats / 1e8,
    confirmations,
    note: sats > 0 ? `Paid ${(sats / 1e8).toFixed(8)} BTC to the store address.` : "This transaction does not pay the store BTC address.",
  };
}

async function verifyTrc20(hash: string, address: string): Promise<VerifyResult> {
  const clean = hash.replace(/^0x/, "");
  const data = (await getJson(`https://api.trongrid.io/v1/transactions/${clean}/events`)) as
    | { data?: { contract_address?: string; event_name?: string; result?: Record<string, string>; block_number?: number }[] }
    | null;
  const events = data?.data ?? [];
  if (events.length === 0) {
    return { found: false, paid: 0, confirmations: 0, note: "Transaction not found on the TRON network yet." };
  }
  let total = 0;
  for (const event of events) {
    if ((event.event_name ?? "").toLowerCase() !== "transfer") continue;
    if ((event.contract_address ?? "").toLowerCase() !== USDT_TRC20_CONTRACT.toLowerCase()) continue;
    const to = event.result?.["to"] ?? event.result?.["1"] ?? "";
    if (to.toLowerCase() !== address.toLowerCase()) continue;
    const raw = event.result?.["value"] ?? event.result?.["2"] ?? "0";
    total += Number(raw) / 1e6;
  }
  const info = (await getJson(`https://api.trongrid.io/v1/transactions/${clean}`)) as
    | { data?: { ret?: { contractRet?: string }[] }[] }
    | null;
  const success = info?.data?.[0]?.ret?.[0]?.contractRet !== "REVERT";
  return {
    found: total > 0 && success,
    paid: total,
    confirmations: total > 0 ? 1 : 0,
    note: total > 0 ? `Paid ${total.toFixed(2)} USDT to the store TRC20 address.` : "This transaction does not pay the store USDT (TRC20) address.",
  };
}

async function ethRpc(method: string, params: unknown[]): Promise<unknown | null> {
  for (const url of ETH_RPCS) {
    const result = (await getJson(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    })) as { result?: unknown } | null;
    if (result && result.result != null) return result.result;
  }
  return null;
}

function topicToAddress(topic: string): string {
  return `0x${topic.slice(-40)}`.toLowerCase();
}

async function verifyUsdc(hash: string, address: string): Promise<VerifyResult> {
  const receipt = (await ethRpc("eth_getTransactionReceipt", [hash])) as
    | { status?: string; blockNumber?: string; logs?: { address?: string; topics?: string[]; data?: string }[] }
    | null;
  if (!receipt) {
    return { found: false, paid: 0, confirmations: 0, note: "Transaction not found or not mined on Ethereum yet." };
  }
  if (receipt.status !== "0x1") {
    return { found: false, paid: 0, confirmations: 0, note: "This Ethereum transaction failed on-chain." };
  }
  let total = 0;
  for (const log of receipt.logs ?? []) {
    if ((log.address ?? "").toLowerCase() !== USDC_ERC20_CONTRACT) continue;
    const topics = log.topics ?? [];
    if (topics.length < 3 || topics[0]?.toLowerCase() !== TRANSFER_TOPIC) continue;
    if (topicToAddress(topics[2] as string) !== address.toLowerCase()) continue;
    total += Number(BigInt(log.data ?? "0x0")) / 1e6;
  }
  let confirmations = 0;
  const tip = (await ethRpc("eth_blockNumber", [])) as string | null;
  if (tip && receipt.blockNumber) {
    confirmations = Number(BigInt(tip) - BigInt(receipt.blockNumber)) + 1;
  }
  return {
    found: total > 0,
    paid: total,
    confirmations,
    note: total > 0 ? `Paid ${total.toFixed(2)} USDC to the store address.` : "This transaction does not pay the store USDC address.",
  };
}

export async function verifyPayment(
  asset: PaymentAsset,
  hash: string,
  address: string,
): Promise<VerifyResult> {
  if (!address) {
    return { found: false, paid: 0, confirmations: 0, note: "No receiving address configured for this coin." };
  }
  if (asset === "BTC") return verifyBtc(hash.replace(/^0x/, ""), address);
  if (asset === "USDT_TRC20") return verifyTrc20(hash, address);
  return verifyUsdc(hash.startsWith("0x") ? hash : `0x${hash}`, address);
}

/** Minimum confirmations before an automatic credit is granted. */
export const MIN_CONFIRMATIONS: Record<PaymentAsset, number> = {
  BTC: 1,
  USDT_TRC20: 1,
  USDC_ERC20: 2,
};