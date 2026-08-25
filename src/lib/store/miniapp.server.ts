/** Telegram Mini App backend: initData verification and catalog/cart/payment operations. */
import { createHmac } from "crypto";
import { getDb, getOrCreateUser, getSettings, type BotUser, type StoreSettings } from "./db.server";
import { createInvoice, type Transaction } from "./payments.server";
import { ASSET_LABEL, ASSET_NETWORK, formatAmount, type PaymentAsset } from "./rates.server";
import {
  addToCart,
  cartTotal,
  checkout,
  getCart,
  listCategories,
  listProducts,
  listOrders,
  listSubcategories,
  type Product,
} from "./shop.server";
import { isPlausibleHash } from "./verify.server";
import { verifyAndSettle } from "./payments.server";

export type MiniAppUser = { user: BotUser; settings: StoreSettings };

/** Validates Telegram WebApp initData (HMAC-SHA256 with the bot token). */
export async function authenticate(initData: string): Promise<MiniAppUser> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("Bot is not configured");
  const params = new URLSearchParams(initData);
  const hash = params.get("hash");
  params.delete("hash");
  if (!hash) throw new Error("Missing Telegram signature");

  const dataCheckString = [...params.entries()]
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(token).digest();
  const computed = createHmac("sha256", secret).update(dataCheckString).digest("hex");
  if (computed !== hash) throw new Error("Invalid Telegram signature");

  const authDate = Number(params.get("auth_date") ?? 0);
  if (!authDate || Date.now() / 1000 - authDate > 86_400) throw new Error("Session expired, reopen the app");

  const parsed = JSON.parse(params.get("user") ?? "null") as
    | { id: number; username?: string; first_name?: string }
    | null;
  if (!parsed?.id) throw new Error("Missing Telegram user");

  const user = await getOrCreateUser(parsed);
  if (user.is_banned) throw new Error("Your account is suspended");
  const settings = await getSettings();
  return { user, settings };
}

function publicProduct(p: Product) {
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    price: Number(p.price),
    image_url: p.image_url,
    category_id: p.category_id,
    subcategory_id: p.subcategory_id,
    in_stock: p.product_type === "file" || p.stock_count > 0,
  };
}

export async function bootstrap(initData: string) {
  const { user, settings } = await authenticate(initData);
  const db = await getDb();
  const [categories, products, cart, orders] = await Promise.all([
    listCategories(),
    listProducts(null),
    getCart(user.id),
    listOrders(user.id),
  ]);
  const subs = await Promise.all(categories.map((c) => listSubcategories(c.id)));
  const { data: fresh } = await db.from("bot_users").select("wallet_balance").eq("id", user.id).maybeSingle();

  return {
    user: {
      telegram_id: user.telegram_id,
      username: user.username,
      first_name: user.first_name,
      balance: Number(fresh?.wallet_balance ?? user.wallet_balance),
    },
    store: {
      name: settings.store_name,
      welcome: settings.welcome_message,
      banner: settings.banner_image_url,
      support: settings.support_username,
      min_topup: Number(settings.min_topup_usd),
    },
    categories: categories.map((c, index) => ({
      id: c.id,
      name: c.name,
      description: c.description,
      image_url: c.image_url,
      subcategories: (subs[index] ?? []).map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        image_url: s.image_url,
      })),
    })),
    products: products.map(publicProduct),
    cart: cart.map((row) => ({
      id: row.id,
      quantity: row.quantity,
      product: publicProduct(row.product),
    })),
    cartTotal: cartTotal(cart),
    orders,
  };
}

export async function addItem(initData: string, productId: number) {
  const { user } = await authenticate(initData);
  await addToCart(user.id, productId);
  return { ok: true };
}

export async function removeItem(initData: string, cartItemId: number) {
  const { user } = await authenticate(initData);
  const db = await getDb();
  await db.from("cart_items").delete().eq("id", cartItemId).eq("user_id", user.id);
  return { ok: true };
}

export async function pay(initData: string) {
  const { user } = await authenticate(initData);
  const result = await checkout(user);
  return result;
}

export type MiniInvoice = {
  id: number;
  code: string;
  asset: PaymentAsset;
  assetLabel: string;
  network: string;
  address: string;
  amount: string;
  amountUsd: number;
  expiresAt: string | null;
};

function toInvoice(tx: Transaction): MiniInvoice {
  return {
    id: tx.id,
    code: tx.invoice_code,
    asset: tx.asset,
    assetLabel: ASSET_LABEL[tx.asset],
    network: ASSET_NETWORK[tx.asset],
    address: tx.pay_address,
    amount: formatAmount(Number(tx.expected_amount), tx.asset),
    amountUsd: Number(tx.amount_usd),
    expiresAt: tx.expires_at,
  };
}

export async function topUp(initData: string, asset: PaymentAsset, amountUsd: number) {
  const { user, settings } = await authenticate(initData);
  if (!Number.isFinite(amountUsd) || amountUsd < Number(settings.min_topup_usd)) {
    throw new Error(`Minimum top-up is $${Number(settings.min_topup_usd).toFixed(2)}`);
  }
  const tx = await createInvoice(user.id, asset, Math.round(amountUsd * 100) / 100, settings);
  return toInvoice(tx);
}

export async function submitHash(initData: string, txId: number, hash: string) {
  const { user, settings } = await authenticate(initData);
  const db = await getDb();
  const { data } = await db.from("transactions").select("*").eq("id", txId).eq("user_id", user.id).maybeSingle();
  const tx = data as Transaction | null;
  if (!tx) throw new Error("Invoice not found");
  if (!isPlausibleHash(tx.asset, hash)) throw new Error("That does not look like a valid transaction hash");
  const { error } = await db
    .from("transactions")
    .update({ tx_hash: hash, status: "submitted", submitted_at: new Date().toISOString() })
    .eq("id", tx.id);
  if (error) throw new Error("This transaction hash was already submitted");
  const outcome = await verifyAndSettle({ ...tx, tx_hash: hash, status: "submitted" }, settings);
  const { data: fresh } = await db.from("bot_users").select("wallet_balance").eq("id", user.id).maybeSingle();
  return { status: outcome.status, message: outcome.message, balance: Number(fresh?.wallet_balance ?? 0) };
}
