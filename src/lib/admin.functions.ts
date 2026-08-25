import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data, error } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden");
}

async function adminDb(context: { supabase: any; userId: string }) {
  await assertAdmin(context);
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const claimAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { count } = await supabaseAdmin.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "admin");
    if ((count ?? 0) > 0) return { granted: false, reason: "An admin already exists." };
    const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: context.userId, role: "admin" });
    if (error) throw new Error(error.message);
    return { granted: true, reason: "You are now the store admin." };
  });

export const adminDashboardData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await adminDb(context);
    const [customers, orders, transactions, products, categories, subcategories, disputes, broadcasts, settings] = await Promise.all([
      db.from("bot_users").select("*").order("created_at", { ascending: false }).limit(250),
      db.from("orders").select("*, bot_users(telegram_id, username)").order("created_at", { ascending: false }).limit(100),
      db.from("transactions").select("*").order("created_at", { ascending: false }).limit(100),
      db.from("products").select("*").order("id"),
      db.from("categories").select("*").order("sort_order").order("id"),
      db.from("subcategories").select("*").order("id"),
      db.from("disputes").select("*, orders(total_amount), bot_users(telegram_id, username)").order("created_at", { ascending: false }).limit(100),
      db.from("broadcasts").select("*").order("created_at", { ascending: false }).limit(30),
      db.from("store_settings").select("*").eq("id", 1).maybeSingle(),
    ]);
    const errors = [customers, orders, transactions, products, categories, subcategories, disputes, broadcasts, settings]
      .map((result) => result.error).filter(Boolean);
    if (errors.length) throw new Error(errors[0]!.message);
    const completedOrders = (orders.data ?? []).filter((order: any) => order.status === "completed");
    return {
      customers: customers.data ?? [], orders: orders.data ?? [], transactions: transactions.data ?? [],
      products: products.data ?? [], categories: categories.data ?? [], subcategories: subcategories.data ?? [],
      disputes: disputes.data ?? [], broadcasts: broadcasts.data ?? [], settings: settings.data,
      stats: {
        customers: (customers.data ?? []).length,
        orders: completedOrders.length,
        pendingPayments: (transactions.data ?? []).filter((tx: any) => ["pending", "submitted"].includes(tx.status)).length,
        revenue: completedOrders.reduce((sum: number, order: any) => sum + Number(order.total_amount ?? 0), 0),
        liability: (customers.data ?? []).reduce((sum: number, user: any) => sum + Number(user.wallet_balance ?? 0), 0),
        openDisputes: (disputes.data ?? []).filter((item: any) => item.status === "opened").length,
      },
    };
  });

export const reviewPayment = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: number; action: "approve" | "reject" | "recheck" }) => {
    if (!Number.isInteger(input.id) || input.id <= 0) throw new Error("Invalid invoice");
    if (!["approve", "reject", "recheck"].includes(input.action)) throw new Error("Invalid action");
    return input;
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { data: tx } = await db.from("transactions").select("*").eq("id", data.id).maybeSingle();
    if (!tx) throw new Error("Invoice not found");
    const { settleTransaction, verifyAndSettle } = await import("./store/payments.server");
    if (data.action === "approve") {
      const result = await settleTransaction(data.id, { auto: false, note: "Approved from web admin" });
      return { message: result.credited ? "Payment approved and credited." : "Invoice was already processed." };
    }
    if (data.action === "recheck") return { message: (await verifyAndSettle(tx as any)).message };
    await db.from("transactions").update({ status: "failed", verification_note: "Rejected from web admin" }).eq("id", data.id);
    const { data: user } = await db.from("bot_users").select("telegram_id").eq("id", tx.user_id).maybeSingle();
    if (user) (await import("./store/telegram.server")).sendMessage(Number(user.telegram_id), `Payment ${tx.invoice_code} was rejected.`);
    return { message: "Payment rejected." };
  });

export const adjustCustomerBalance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { userId: number; amount: number; reason: string }) => {
    if (!Number.isInteger(input.userId) || !Number.isFinite(input.amount) || input.amount === 0) throw new Error("Invalid adjustment");
    return { ...input, amount: Number(input.amount.toFixed(2)), reason: (input.reason || "Admin adjustment").slice(0, 200) };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { adjustBalance, getDb } = await import("./store/db.server");
    const balance = await adjustBalance(data.userId, data.amount, data.reason);
    const db = await getDb();
    const { data: user } = await db.from("bot_users").select("telegram_id").eq("id", data.userId).maybeSingle();
    if (user) (await import("./store/telegram.server")).sendMessage(Number(user.telegram_id), `Your balance changed by <b>$${data.amount.toFixed(2)}</b>. New balance: <b>$${balance.toFixed(2)}</b>.`);
    return { balance };
  });

export const updateCustomers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ids: number[]; isBanned: boolean }) => {
    const ids = [...new Set(input.ids)].filter(Number.isInteger).slice(0, 250);
    if (!ids.length) throw new Error("Select at least one customer");
    return { ids, isBanned: Boolean(input.isBanned) };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { error } = await db.from("bot_users").update({ is_banned: data.isBanned }).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { message: `${data.ids.length} customer${data.ids.length === 1 ? "" : "s"} updated.` };
  });

export const inviteTelegramUser = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { telegramId: string; firstName?: string; username?: string; note?: string }) => {
    const telegramId = Number(String(input.telegramId ?? "").trim());
    if (!Number.isInteger(telegramId) || telegramId <= 0) throw new Error("Enter a valid Telegram ID");
    return { telegramId, firstName: input.firstName?.trim().slice(0, 60) || null, username: input.username?.trim().replace(/^@/, "").slice(0, 60) || null, note: input.note?.trim().slice(0, 500) || null };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { data: existing } = await db.from("bot_users").select("id").eq("telegram_id", data.telegramId).maybeSingle();
    if (!existing) {
      const { error } = await db.from("bot_users").insert({ telegram_id: data.telegramId, username: data.username, first_name: data.firstName });
      if (error) throw new Error(error.message);
    }
    const { getSettings, miniAppUrl } = await import("./store/db.server");
    const { sendCard, escapeHtml } = await import("./store/telegram.server");
    const settings = await getSettings();
    const text = [`<b>Welcome${data.firstName ? ` ${escapeHtml(data.firstName)}` : ""} to ${escapeHtml(settings.store_name)}</b>`, "", escapeHtml(settings.welcome_message), data.note ? `\n${escapeHtml(data.note)}` : ""].join("\n");
    const sent = await sendCard(data.telegramId, settings.banner_image_url, text, [[{ text: "Open store", web_app: { url: miniAppUrl(settings) } }], [{ text: "Browse in chat", callback_data: "shop" }]]);
    return { message: `${existing ? "Customer already existed" : "Customer added"}${sent ? " and invitation delivered." : ", but Telegram refused delivery."}` };
  });

export const saveProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => {
    const id = input.id == null ? null : Number(input.id);
    const name = String(input.name ?? "").trim().slice(0, 120);
    const price = Number(input.price);
    if ((id !== null && !Number.isInteger(id)) || name.length < 2 || !Number.isFinite(price) || price < 0) throw new Error("Check product name and price");
    return { id, patch: { name, price: Number(price.toFixed(2)), description: String(input.description ?? "").trim().slice(0, 1000) || null, product_type: input.productType === "file" ? "file" : "key", category_id: input.categoryId ? Number(input.categoryId) : null, subcategory_id: input.subcategoryId ? Number(input.subcategoryId) : null, image_url: String(input.imageUrl ?? "").trim().slice(0, 1000) || null, download_link: String(input.downloadLink ?? "").trim().slice(0, 1000) || null, is_active: Boolean(input.isActive) } };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const result = data.id ? await db.from("products").update(data.patch).eq("id", data.id) : await db.from("products").insert(data.patch);
    if (result.error) throw new Error(result.error.message);
    return { message: data.id ? "Product updated." : "Product created." };
  });

export const bulkUpdateProducts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { ids: number[]; action: "activate" | "deactivate" | "price" | "category"; value?: number }) => {
    const ids = [...new Set(input.ids)].filter(Number.isInteger).slice(0, 250);
    if (!ids.length) throw new Error("Select at least one product");
    if (!["activate", "deactivate", "price", "category"].includes(input.action)) throw new Error("Invalid bulk action");
    if (["price", "category"].includes(input.action) && !Number.isFinite(input.value)) throw new Error("Enter a valid value");
    return { ...input, ids };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const patch = data.action === "activate" ? { is_active: true } : data.action === "deactivate" ? { is_active: false } : data.action === "price" ? { price: Number(Number(data.value).toFixed(2)) } : { category_id: Number(data.value) };
    const { error } = await db.from("products").update(patch).in("id", data.ids);
    if (error) throw new Error(error.message);
    return { message: `${data.ids.length} products updated.` };
  });

export const addProductKeys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { productId: number; keys: string }) => {
    const keys = [...new Set((input.keys ?? "").split("\n").map((line) => line.trim()).filter(Boolean))].slice(0, 1000);
    if (!Number.isInteger(input.productId) || !keys.length) throw new Error("Choose a product and add at least one key");
    return { productId: input.productId, keys };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { error } = await db.from("product_keys").insert(data.keys.map((key) => ({ product_id: data.productId, key_value: key })));
    if (error) throw new Error(error.message);
    return { message: `${data.keys.length} inventory items added.` };
  });

export const saveCategory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => {
    const name = String(input.name ?? "").trim();
    if (name.length < 2) throw new Error("Name is too short");
    return { id: input.id ? Number(input.id) : null, kind: input.kind === "subcategory" ? "subcategory" : "category", patch: { name: name.slice(0, 80), description: String(input.description ?? "").trim().slice(0, 500) || null, ...(input.kind === "subcategory" ? { category_id: Number(input.categoryId) } : { sort_order: Number(input.sortOrder ?? 0) }) } };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const table = data.kind === "category" ? "categories" : "subcategories";
    const result = data.id ? await db.from(table).update(data.patch).eq("id", data.id) : await db.from(table).insert(data.patch);
    if (result.error) throw new Error(result.error.message);
    return { message: `${data.kind === "category" ? "Category" : "Subcategory"} saved.` };
  });

export const resolveDispute = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { id: number; resolution: string }) => {
    const resolution = String(input.resolution ?? "").trim().slice(0, 1000);
    if (!Number.isInteger(input.id) || resolution.length < 2) throw new Error("Enter a resolution");
    return { id: input.id, resolution };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { data: dispute, error } = await db.from("disputes").update({ status: "resolved", resolution: data.resolution, resolved_at: new Date().toISOString() }).eq("id", data.id).select("user_id, order_id").single();
    if (error) throw new Error(error.message);
    await db.from("orders").update({ dispute_status: "resolved" }).eq("id", dispute.order_id);
    const { data: user } = await db.from("bot_users").select("telegram_id").eq("id", dispute.user_id).maybeSingle();
    if (user) (await import("./store/telegram.server")).sendMessage(Number(user.telegram_id), `Your dispute was resolved:\n${data.resolution}`);
    return { message: "Dispute resolved." };
  });

export const broadcastMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { text: string }) => {
    const text = String(input.text ?? "").trim();
    if (text.length < 2 || text.length > 3000) throw new Error("Message must be 2 to 3000 characters");
    return { text };
  })
  .handler(async ({ data, context }) => {
    const db = await adminDb(context);
    const { sendMessage } = await import("./store/telegram.server");
    const { data: users } = await db.from("bot_users").select("telegram_id").eq("is_banned", false);
    let sent = 0;
    for (const [index, user] of (users ?? []).entries()) {
      if (index > 0 && index % 25 === 0) await new Promise((resolve) => setTimeout(resolve, 1100));
      if (await sendMessage(Number(user.telegram_id), data.text)) sent += 1;
    }
    await db.from("broadcasts").insert({ message_text: data.text, sent_count: sent });
    return { sent, failed: (users?.length ?? 0) - sent };
  });

export const saveSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: any) => ({
    store_name: String(input.store_name ?? "").trim().slice(0, 100), welcome_message: String(input.welcome_message ?? "").trim().slice(0, 2000),
    support_username: String(input.support_username ?? "").trim().replace(/^@/, "").slice(0, 100) || null,
    mini_app_url: String(input.mini_app_url ?? "").trim().slice(0, 1000) || null, banner_image_url: String(input.banner_image_url ?? "").trim().slice(0, 1000) || null,
    btc_address: String(input.btc_address ?? "").trim().slice(0, 200), usdt_trc20_address: String(input.usdt_trc20_address ?? "").trim().slice(0, 200),
    usdt_erc20_address: String(input.usdt_erc20_address ?? "").trim().slice(0, 200), usdc_erc20_address: String(input.usdc_erc20_address ?? "").trim().slice(0, 200),
    invoice_expiry_minutes: Math.min(1440, Math.max(5, Number(input.invoice_expiry_minutes ?? 30))), amount_tolerance_percent: Math.min(20, Math.max(0, Number(input.amount_tolerance_percent ?? 2))),
  }))
  .handler(async ({ data, context }) => {
    if (!data.store_name) throw new Error("Store name is required");
    const db = await adminDb(context);
    const { error } = await db.from("store_settings").update(data).eq("id", 1);
    if (error) throw new Error(error.message);
    return { message: "Store settings saved." };
  });
