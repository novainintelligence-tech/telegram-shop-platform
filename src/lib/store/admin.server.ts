/** In-Telegram admin panel. */
import { getDb, getSettings, money, setState, type StoreSettings } from "./db.server";
import { ASSET_LABEL, formatAmount, type PaymentAsset } from "./rates.server";
import { settleTransaction, verifyAndSettle, type Transaction } from "./payments.server";
import { answerCallback, editMessage, escapeHtml, sendMessage, type InlineKeyboard } from "./telegram.server";

export const adminMenu: InlineKeyboard = [
  [
    { text: "📊 Stats", callback_data: "adm:stats" },
    { text: "💳 Payments", callback_data: "adm:pays" },
  ],
  [
    { text: "📦 Products", callback_data: "adm:products" },
    { text: "➕ Add product", callback_data: "adm:addproduct" },
  ],
  [
    { text: "🔑 Add keys", callback_data: "adm:addkeys" },
    { text: "🗂 Add category", callback_data: "adm:addcat" },
  ],
  [
    { text: "👥 Users", callback_data: "adm:users" },
    { text: "⚖️ Disputes", callback_data: "adm:disputes" },
  ],
  [
    { text: "📣 Broadcast", callback_data: "adm:broadcast" },
    { text: "💵 Adjust balance", callback_data: "adm:balance" },
  ],
  [
    { text: "⚙️ Wallets & settings", callback_data: "adm:settings" },
    { text: "🏠 Store menu", callback_data: "menu" },
  ],
];

export async function showAdminMenu(chatId: number, messageId?: number) {
  const text = "🛠 <b>Admin panel</b>\n\nManage your store, payments and customers.";
  if (messageId) return editMessage(chatId, messageId, text, adminMenu);
  return sendMessage(chatId, text, adminMenu);
}

async function stats(): Promise<string> {
  const db = await getDb();
  const [users, orders, pending, revenue] = await Promise.all([
    db.from("bot_users").select("id", { count: "exact", head: true }),
    db.from("orders").select("id", { count: "exact", head: true }).eq("status", "completed"),
    db.from("transactions").select("id", { count: "exact", head: true }).in("status", ["pending", "submitted"]),
    db.from("orders").select("total_amount").eq("status", "completed"),
  ]);
  const total = ((revenue.data ?? []) as { total_amount: number }[]).reduce(
    (sum, row) => sum + Number(row.total_amount),
    0,
  );
  return [
    "📊 <b>Store stats</b>",
    "",
    `Customers: <b>${users.count ?? 0}</b>`,
    `Completed orders: <b>${orders.count ?? 0}</b>`,
    `Revenue: <b>${money(total)}</b>`,
    `Payments awaiting review: <b>${pending.count ?? 0}</b>`,
  ].join("\n");
}

async function pendingPayments(): Promise<{ text: string; markup: InlineKeyboard }> {
  const db = await getDb();
  const { data } = await db
    .from("transactions")
    .select("*, bot_users(telegram_id, username)")
    .in("status", ["pending", "submitted"])
    .order("id", { ascending: false })
    .limit(10);
  const rows = (data ?? []) as unknown as (Transaction & { bot_users: { telegram_id: number; username: string | null } | null })[];
  if (rows.length === 0) {
    return { text: "💳 <b>Payments</b>\n\nNo payments are waiting for review.", markup: [[{ text: "⬅️ Admin", callback_data: "adm" }]] };
  }
  const markup: InlineKeyboard = [];
  const lines = rows.map((tx) => {
    markup.push([
      { text: `✅ ${tx.invoice_code}`, callback_data: `adm:pay:ok:${tx.id}` },
      { text: "🔁", callback_data: `adm:pay:re:${tx.id}` },
      { text: "❌", callback_data: `adm:pay:no:${tx.id}` },
    ]);
    return [
      `<code>${escapeHtml(tx.invoice_code)}</code> — ${money(tx.amount_usd)} · ${escapeHtml(ASSET_LABEL[tx.asset as PaymentAsset])}`,
      `  user: @${escapeHtml(tx.bot_users?.username ?? String(tx.bot_users?.telegram_id ?? "?"))}`,
      `  expect: <code>${formatAmount(Number(tx.expected_amount), tx.asset as PaymentAsset)}</code>`,
      `  txid: <code>${escapeHtml(tx.tx_hash ?? "not submitted")}</code>`,
      tx.verification_note ? `  check: ${escapeHtml(tx.verification_note)}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  });
  markup.push([{ text: "⬅️ Admin", callback_data: "adm" }]);
  return { text: ["💳 <b>Payments awaiting review</b>", "", ...lines].join("\n\n"), markup };
}

async function productList(): Promise<string> {
  const db = await getDb();
  const { data } = await db.from("products").select("id, name, price, stock_count, is_active").order("id");
  const rows = (data ?? []) as { id: number; name: string; price: number; stock_count: number; is_active: boolean }[];
  if (rows.length === 0) return "📦 No products yet. Use <b>Add product</b>.";
  return [
    "📦 <b>Products</b>",
    "",
    ...rows.map((p) => `#${p.id} ${escapeHtml(p.name)} — ${money(p.price)} · stock ${p.stock_count}${p.is_active ? "" : " · hidden"}`),
  ].join("\n");
}

function settingsText(settings: StoreSettings): string {
  return [
    "⚙️ <b>Wallets & settings</b>",
    "",
    `Store: <b>${escapeHtml(settings.store_name)}</b>`,
    `Auto-confirm: <b>${settings.auto_confirm ? "ON" : "OFF"}</b>`,
    `Invoice validity: <b>${settings.payment_expiry_minutes} min</b>`,
    `Minimum top-up: <b>${money(settings.min_topup_usd)}</b>`,
    "",
    `BTC: <code>${escapeHtml(settings.btc_address ?? "-")}</code>`,
    `USDT TRC20: <code>${escapeHtml(settings.usdt_trc20_address ?? "-")}</code>`,
    `USDC ERC20: <code>${escapeHtml(settings.usdc_erc20_address ?? "-")}</code>`,
  ].join("\n");
}

const settingsKeyboard: InlineKeyboard = [
  [{ text: "₿ Set BTC address", callback_data: "adm:set:btc" }],
  [{ text: "₮ Set USDT TRC20 address", callback_data: "adm:set:usdt" }],
  [{ text: "＄ Set USDC address", callback_data: "adm:set:usdc" }],
  [{ text: "🔁 Toggle auto-confirm", callback_data: "adm:set:auto" }],
  [{ text: "👋 Set welcome message", callback_data: "adm:set:welcome" }],
  [{ text: "⬅️ Admin", callback_data: "adm" }],
];

export async function handleAdminCallback(
  chatId: number,
  messageId: number,
  callbackId: string,
  parts: string[],
): Promise<boolean> {
  const db = await getDb();
  const settings = await getSettings();
  const action = parts[1] ?? "";

  if (parts.length === 1) {
    await showAdminMenu(chatId, messageId);
    return true;
  }

  switch (action) {
    case "stats":
      await editMessage(chatId, messageId, await stats(), [[{ text: "⬅️ Admin", callback_data: "adm" }]]);
      return true;
    case "pays": {
      const view = await pendingPayments();
      await editMessage(chatId, messageId, view.text, view.markup);
      return true;
    }
    case "products":
      await editMessage(chatId, messageId, await productList(), [
        [{ text: "➕ Add product", callback_data: "adm:addproduct" }],
        [{ text: "🔑 Add keys", callback_data: "adm:addkeys" }],
        [{ text: "⬅️ Admin", callback_data: "adm" }],
      ]);
      return true;
    case "addcat":
      await setState(chatId, "adm_addcat");
      await editMessage(chatId, messageId, "🗂 Send the new category name.", [[{ text: "Cancel", callback_data: "adm" }]]);
      return true;
    case "addproduct":
      await setState(chatId, "adm_addproduct");
      await editMessage(
        chatId,
        messageId,
        [
          "➕ <b>Add product</b>",
          "",
          "Send one message in this format:",
          "<code>name | price | key|file | category name | description | download link</code>",
          "",
          "Example:",
          "<code>Netflix 1 Month | 9.99 | key | Streaming | Private account | </code>",
        ].join("\n"),
        [[{ text: "Cancel", callback_data: "adm" }]],
      );
      return true;
    case "addkeys":
      await setState(chatId, "adm_addkeys");
      await editMessage(
        chatId,
        messageId,
        "🔑 Send: <code>product_id</code> on the first line, then one key per line.",
        [[{ text: "Cancel", callback_data: "adm" }]],
      );
      return true;
    case "users": {
      const { data } = await db
        .from("bot_users")
        .select("telegram_id, username, wallet_balance, is_banned")
        .order("id", { ascending: false })
        .limit(15);
      const rows = (data ?? []) as { telegram_id: number; username: string | null; wallet_balance: number; is_banned: boolean }[];
      await editMessage(
        chatId,
        messageId,
        [
          "👥 <b>Latest customers</b>",
          "",
          ...rows.map((u) => `${u.telegram_id} @${escapeHtml(u.username ?? "-")} — ${money(u.wallet_balance)}${u.is_banned ? " · 🚫 banned" : ""}`),
          "",
          "Use /ban &lt;telegram id&gt; or /unban &lt;telegram id&gt;.",
        ].join("\n"),
        [[{ text: "⬅️ Admin", callback_data: "adm" }]],
      );
      return true;
    }
    case "disputes": {
      const { data } = await db
        .from("disputes")
        .select("id, order_id, reason, status")
        .eq("status", "opened")
        .order("id", { ascending: false })
        .limit(10);
      const rows = (data ?? []) as { id: number; order_id: number; reason: string; status: string }[];
      const markup: InlineKeyboard = rows.map((d) => [
        { text: `✅ Resolve dispute #${d.id}`, callback_data: `adm:dis:${d.id}` },
      ]);
      markup.push([{ text: "⬅️ Admin", callback_data: "adm" }]);
      await editMessage(
        chatId,
        messageId,
        rows.length === 0
          ? "⚖️ No open disputes."
          : ["⚖️ <b>Open disputes</b>", "", ...rows.map((d) => `#${d.id} · order #${d.order_id}\n${escapeHtml(d.reason)}`)].join("\n\n"),
        markup,
      );
      return true;
    }
    case "dis": {
      const id = Number(parts[2]);
      const { data: dispute } = await db
        .from("disputes")
        .update({ status: "resolved", resolved_at: new Date().toISOString() })
        .eq("id", id)
        .select("order_id, user_id")
        .maybeSingle();
      if (dispute) {
        await db.from("orders").update({ dispute_status: "resolved" }).eq("id", dispute.order_id);
        const { data: user } = await db.from("bot_users").select("telegram_id").eq("id", dispute.user_id).maybeSingle();
        if (user) await sendMessage(Number(user.telegram_id), `⚖️ Your dispute on order #${dispute.order_id} has been resolved by the admin.`);
      }
      await answerCallback(callbackId, "Dispute resolved");
      await showAdminMenu(chatId, messageId);
      return true;
    }
    case "broadcast":
      await setState(chatId, "adm_broadcast");
      await editMessage(chatId, messageId, "📣 Send the broadcast message to deliver to all customers.", [
        [{ text: "Cancel", callback_data: "adm" }],
      ]);
      return true;
    case "balance":
      await setState(chatId, "adm_balance");
      await editMessage(
        chatId,
        messageId,
        "💵 Send: <code>telegram_id amount reason</code>\nUse a negative amount to deduct.\nExample: <code>6505578903 25 manual top-up</code>",
        [[{ text: "Cancel", callback_data: "adm" }]],
      );
      return true;
    case "settings":
      await editMessage(chatId, messageId, settingsText(settings), settingsKeyboard);
      return true;
    case "set": {
      const which = parts[2];
      if (which === "auto") {
        await db.from("store_settings").update({ auto_confirm: !settings.auto_confirm }).eq("id", 1);
        const fresh = await getSettings();
        await answerCallback(callbackId, `Auto-confirm ${fresh.auto_confirm ? "enabled" : "disabled"}`);
        await editMessage(chatId, messageId, settingsText(fresh), settingsKeyboard);
        return true;
      }
      await setState(chatId, `adm_set_${which}`);
      await editMessage(chatId, messageId, `Send the new value for <b>${escapeHtml(which ?? "")}</b>.`, [
        [{ text: "Cancel", callback_data: "adm:settings" }],
      ]);
      return true;
    }
    case "pay": {
      const mode = parts[2];
      const txId = Number(parts[3]);
      const { data } = await db.from("transactions").select("*").eq("id", txId).maybeSingle();
      const tx = data as Transaction | null;
      if (!tx) {
        await answerCallback(callbackId, "Invoice not found", true);
        return true;
      }
      if (mode === "ok") {
        const result = await settleTransaction(tx.id, { auto: false, note: "Approved manually by admin" });
        await answerCallback(callbackId, result.credited ? "Approved and credited" : "Already processed", true);
      } else if (mode === "no") {
        await db.from("transactions").update({ status: "failed", verification_note: "Rejected by admin" }).eq("id", tx.id);
        const { data: user } = await db.from("bot_users").select("telegram_id").eq("id", tx.user_id).maybeSingle();
        if (user) {
          await sendMessage(
            Number(user.telegram_id),
            `❌ Your payment for invoice <code>${escapeHtml(tx.invoice_code)}</code> was rejected. Contact support if this is a mistake.`,
          );
        }
        await answerCallback(callbackId, "Rejected", true);
      } else {
        const outcome = await verifyAndSettle(tx, settings);
        await answerCallback(callbackId, outcome.message.slice(0, 190), true);
      }
      const view = await pendingPayments();
      await editMessage(chatId, messageId, view.text, view.markup);
      return true;
    }
    default:
      return false;
  }
}

/** Handles free-text replies while an admin flow is active. Returns true when consumed. */
export async function handleAdminState(
  chatId: number,
  text: string,
  state: { name: string; data: Record<string, unknown> },
): Promise<boolean> {
  const db = await getDb();
  if (!state.name.startsWith("adm_")) return false;

  if (state.name === "adm_addcat") {
    await db.from("categories").insert({ name: text.trim() });
    await setState(chatId, null);
    await sendMessage(chatId, `🗂 Category "${escapeHtml(text.trim())}" created.`, adminMenu);
    return true;
  }

  if (state.name === "adm_addproduct") {
    const [name, price, type, categoryName, description, link] = text.split("|").map((part) => part.trim());
    if (!name || !price || Number.isNaN(Number(price))) {
      await sendMessage(chatId, "❌ Invalid format. Use: name | price | key/file | category | description | link");
      return true;
    }
    let categoryId: number | null = null;
    if (categoryName) {
      const { data: existing } = await db.from("categories").select("id").ilike("name", categoryName).maybeSingle();
      if (existing) categoryId = existing.id as number;
      else {
        const { data: created } = await db.from("categories").insert({ name: categoryName }).select("id").single();
        categoryId = (created?.id as number) ?? null;
      }
    }
    const { data: product } = await db
      .from("products")
      .insert({
        name,
        price: Number(price),
        product_type: type === "file" ? "file" : "key",
        category_id: categoryId,
        description: description || null,
        download_link: link || null,
      })
      .select("id")
      .single();
    await setState(chatId, null);
    await sendMessage(
      chatId,
      `📦 Product created with ID <b>#${product?.id}</b>. Add stock with <b>Add keys</b> for key products.`,
      adminMenu,
    );
    return true;
  }

  if (state.name === "adm_addkeys") {
    const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
    const productId = Number(lines.shift());
    if (!productId || lines.length === 0) {
      await sendMessage(chatId, "❌ Send the product id on the first line and keys on following lines.");
      return true;
    }
    await db.from("product_keys").insert(lines.map((key) => ({ product_id: productId, key_value: key })));
    const { count } = await db
      .from("product_keys")
      .select("id", { count: "exact", head: true })
      .eq("product_id", productId)
      .eq("is_sold", false);
    await db.from("products").update({ stock_count: count ?? 0 }).eq("id", productId);
    await setState(chatId, null);
    await sendMessage(chatId, `🔑 Added ${lines.length} keys. Product #${productId} stock is now ${count ?? 0}.`, adminMenu);
    return true;
  }

  if (state.name === "adm_broadcast") {
    const { data: users } = await db.from("bot_users").select("telegram_id").eq("is_banned", false);
    let sent = 0;
    for (const user of (users ?? []) as { telegram_id: number }[]) {
      const result = await sendMessage(Number(user.telegram_id), text);
      if (result !== null) sent += 1;
    }
    await db.from("broadcasts").insert({ message_text: text, sent_count: sent });
    await setState(chatId, null);
    await sendMessage(chatId, `📣 Broadcast delivered to ${sent} customers.`, adminMenu);
    return true;
  }

  if (state.name === "adm_balance") {
    const [idPart, amountPart, ...reasonParts] = text.trim().split(/\s+/);
    const telegramId = Number(idPart);
    const amount = Number(amountPart);
    if (!telegramId || Number.isNaN(amount)) {
      await sendMessage(chatId, "❌ Use: telegram_id amount reason");
      return true;
    }
    const { data: user } = await db.from("bot_users").select("id").eq("telegram_id", telegramId).maybeSingle();
    if (!user) {
      await sendMessage(chatId, "❌ No customer with that Telegram ID.");
      return true;
    }
    const { adjustBalance } = await import("./db.server");
    const balance = await adjustBalance(user.id as number, amount, reasonParts.join(" ") || "Admin adjustment");
    await setState(chatId, null);
    await sendMessage(chatId, `💵 Balance updated. New balance: <b>${money(balance)}</b>.`, adminMenu);
    await sendMessage(telegramId, `💵 An admin updated your balance by <b>${money(amount)}</b>. New balance: <b>${money(balance)}</b>.`);
    return true;
  }

  if (state.name.startsWith("adm_set_")) {
    const field = state.name.replace("adm_set_", "");
    const column =
      field === "btc"
        ? "btc_address"
        : field === "usdt"
          ? "usdt_trc20_address"
          : field === "usdc"
            ? "usdc_erc20_address"
            : "welcome_message";
    await db.from("store_settings").update({ [column]: text.trim() }).eq("id", 1);
    await setState(chatId, null);
    await sendMessage(chatId, "✅ Saved.", adminMenu);
    return true;
  }

  return false;
}