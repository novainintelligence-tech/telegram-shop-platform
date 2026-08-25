/** Manual crypto invoice creation, verification and settlement. */
import { addressFor, adjustBalance, getDb, getSettings, money, type StoreSettings } from "./db.server";
import { ASSET_LABEL, ASSET_NETWORK, formatAmount, getUsdPrice, type PaymentAsset } from "./rates.server";
import { escapeHtml, sendMessage, type InlineKeyboard } from "./telegram.server";
import { MIN_CONFIRMATIONS, verifyPayment } from "./verify.server";

export type Transaction = {
  id: number;
  invoice_code: string;
  user_id: number;
  amount_usd: number;
  asset: PaymentAsset;
  pay_address: string;
  expected_amount: number;
  unit_price_usd: number;
  tx_hash: string | null;
  status: "pending" | "submitted" | "completed" | "expired" | "failed";
  auto_verified: boolean;
  verification_note: string | null;
  credited_amount: number | null;
  expires_at: string | null;
};

function invoiceCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  const bytes = crypto.getRandomValues(new Uint8Array(8));
  for (const byte of bytes) code += alphabet[byte % alphabet.length];
  return `INV-${code}`;
}

export async function createInvoice(
  userId: number,
  asset: PaymentAsset,
  amountUsd: number,
  settings: StoreSettings,
): Promise<Transaction> {
  const address = addressFor(settings, asset);
  if (!address) throw new Error(`${ASSET_LABEL[asset]} is not available right now.`);
  const unitPrice = await getUsdPrice(asset);
  const expected = amountUsd / unitPrice;
  const db = await getDb();
  const { data, error } = await db
    .from("transactions")
    .insert({
      invoice_code: invoiceCode(),
      user_id: userId,
      amount_usd: amountUsd,
      asset,
      pay_address: address,
      expected_amount: expected.toFixed(8),
      unit_price_usd: unitPrice.toFixed(8),
      expires_at: new Date(Date.now() + settings.payment_expiry_minutes * 60_000).toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;
  return data as Transaction;
}

export function invoiceText(tx: Transaction, settings: StoreSettings): string {
  const expected = formatAmount(Number(tx.expected_amount), tx.asset);
  const expiry = tx.expires_at ? new Date(tx.expires_at) : null;
  return [
    `🧾 <b>Invoice ${escapeHtml(tx.invoice_code)}</b>`,
    "",
    `Top-up value: <b>${money(tx.amount_usd)}</b>`,
    `Coin: <b>${escapeHtml(ASSET_LABEL[tx.asset])}</b>`,
    `Network: <b>${escapeHtml(ASSET_NETWORK[tx.asset])}</b>`,
    "",
    `Send exactly:`,
    `<code>${expected}</code> ${tx.asset === "BTC" ? "BTC" : tx.asset === "USDT_TRC20" ? "USDT" : "USDC"}`,
    "",
    `To this address:`,
    `<code>${escapeHtml(tx.pay_address)}</code>`,
    "",
    expiry ? `⏳ Valid until <b>${expiry.toUTCString()}</b>` : "",
    "",
    "After sending, tap <b>I have paid</b> and submit your transaction hash (TxID).",
    settings.auto_confirm
      ? "Your payment is confirmed automatically once the transaction is found on-chain; otherwise an admin reviews it."
      : "An admin will review and confirm your payment.",
    "",
    "⚠️ Send only on the exact network shown above — funds sent on another network are lost.",
  ]
    .filter(Boolean)
    .join("\n");
}

export function invoiceKeyboard(tx: Transaction): InlineKeyboard {
  return [
    [{ text: "✅ I have paid — submit TxID", callback_data: `pay:hash:${tx.id}` }],
    [{ text: "🔄 Check payment status", callback_data: `pay:check:${tx.id}` }],
    [{ text: "❌ Cancel invoice", callback_data: `pay:cancel:${tx.id}` }],
    [{ text: "⬅️ Back to menu", callback_data: "menu" }],
  ];
}

async function notifyAdmin(settings: StoreSettings, text: string, markup?: InlineKeyboard) {
  if (!settings.admin_telegram_id) return;
  await sendMessage(Number(settings.admin_telegram_id), text, markup);
}

/** Credits the user's wallet and closes the invoice. Safe to call twice. */
export async function settleTransaction(
  txId: number,
  opts: { auto: boolean; note?: string },
): Promise<{ credited: boolean; balance?: number }> {
  const db = await getDb();
  const { data: updated, error } = await db
    .from("transactions")
    .update({
      status: "completed",
      auto_verified: opts.auto,
      completed_at: new Date().toISOString(),
      credited_amount: null,
      ...(opts.note ? { verification_note: opts.note } : {}),
    })
    .eq("id", txId)
    .in("status", ["pending", "submitted", "expired", "failed"])
    .select("*, bot_users(telegram_id)")
    .maybeSingle();
  if (error) throw error;
  if (!updated) return { credited: false };

  const tx = updated as unknown as Transaction & { bot_users: { telegram_id: number } | null };
  const balance = await adjustBalance(
    tx.user_id,
    Number(tx.amount_usd),
    `Top-up ${tx.invoice_code} (${tx.asset})`,
    tx.id,
  );
  await db.from("transactions").update({ credited_amount: tx.amount_usd }).eq("id", tx.id);

  const telegramId = tx.bot_users?.telegram_id;
  if (telegramId) {
    await sendMessage(
      Number(telegramId),
      [
        `✅ <b>Payment confirmed</b>`,
        `Invoice: <code>${escapeHtml(tx.invoice_code)}</code>`,
        `Credited: <b>${money(tx.amount_usd)}</b>`,
        `New balance: <b>${money(balance)}</b>`,
        opts.auto ? "\nConfirmed automatically on-chain." : "\nConfirmed by an admin.",
      ].join("\n"),
      [[{ text: "🛍 Start shopping", callback_data: "menu" }]],
    );
  }
  return { credited: true, balance };
}

export type VerifyOutcome = {
  status: "credited" | "pending_review" | "not_found" | "underpaid" | "unconfirmed";
  message: string;
};

/** Verifies the stored tx hash on-chain and settles when it checks out. */
export async function verifyAndSettle(tx: Transaction, settings?: StoreSettings): Promise<VerifyOutcome> {
  const config = settings ?? (await getSettings());
  const db = await getDb();
  if (!tx.tx_hash) return { status: "not_found", message: "No transaction hash submitted yet." };
  if (!config.auto_confirm) {
    return { status: "pending_review", message: "Submitted. An admin will confirm your payment shortly." };
  }

  const result = await verifyPayment(tx.asset, tx.tx_hash, tx.pay_address);
  const tolerance = 1 - Number(config.amount_tolerance_percent) / 100;
  const required = Number(tx.expected_amount) * tolerance;

  await db.from("transactions").update({ verification_note: result.note }).eq("id", tx.id);

  if (!result.found) {
    await notifyAdminPending(config, tx, result.note);
    return { status: "not_found", message: `⏳ ${result.note}\n\nWe will keep checking, and an admin can confirm it manually.` };
  }
  if (result.paid < required) {
    await notifyAdminPending(config, tx, `Underpaid: received ${result.paid}, expected ${tx.expected_amount}`);
    return {
      status: "underpaid",
      message: `⚠️ We found the transaction but it paid less than the invoice amount (${result.paid} vs ${Number(tx.expected_amount).toFixed(8)}). An admin will review it.`,
    };
  }
  if (result.confirmations < MIN_CONFIRMATIONS[tx.asset]) {
    return {
      status: "unconfirmed",
      message: `⏳ Transaction found and waiting for network confirmations (${result.confirmations}/${MIN_CONFIRMATIONS[tx.asset]}). Your balance updates automatically.`,
    };
  }
  const settled = await settleTransaction(tx.id, { auto: true, note: result.note });
  return {
    status: settled.credited ? "credited" : "pending_review",
    message: settled.credited ? "✅ Payment confirmed and your balance has been updated." : "This invoice was already processed.",
  };
}

export async function notifyAdminPending(settings: StoreSettings, tx: Transaction, note: string) {
  await notifyAdmin(
    settings,
    [
      "🔔 <b>Payment awaiting review</b>",
      `Invoice: <code>${escapeHtml(tx.invoice_code)}</code>`,
      `Amount: <b>${money(tx.amount_usd)}</b> (${escapeHtml(ASSET_LABEL[tx.asset])})`,
      `Expected: <code>${formatAmount(Number(tx.expected_amount), tx.asset)}</code>`,
      `TxID: <code>${escapeHtml(tx.tx_hash ?? "-")}</code>`,
      `Check: ${escapeHtml(note)}`,
    ].join("\n"),
    [
      [
        { text: "✅ Approve", callback_data: `adm:pay:ok:${tx.id}` },
        { text: "❌ Reject", callback_data: `adm:pay:no:${tx.id}` },
      ],
      [{ text: "🔁 Re-check on-chain", callback_data: `adm:pay:re:${tx.id}` }],
    ],
  );
}