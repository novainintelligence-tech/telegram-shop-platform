/** Catalog, cart, checkout and delivery logic. */
import { getDb, money, type BotUser } from "./db.server";
import { escapeHtml, type InlineKeyboard } from "./telegram.server";

export type Product = {
  id: number;
  name: string;
  description: string | null;
  price: number;
  stock_count: number;
  product_type: "key" | "file";
  download_link: string | null;
  is_active: boolean;
  category_id: number | null;
  subcategory_id: number | null;
  image_url: string | null;
};

export type Category = {
  id: number;
  name: string;
  description: string | null;
  image_url: string | null;
};

export type Subcategory = Category & { category_id: number | null };

export async function availableStock(product: Product): Promise<number> {
  if (product.product_type === "file") return 9999;
  const db = await getDb();
  const { count } = await db
    .from("product_keys")
    .select("id", { count: "exact", head: true })
    .eq("product_id", product.id)
    .eq("is_sold", false);
  return count ?? 0;
}

export async function listCategories() {
  const db = await getDb();
  const { data } = await db.from("categories").select("*").order("sort_order").order("name");
  return (data ?? []) as Category[];
}

export async function getCategory(id: number): Promise<Category | null> {
  const db = await getDb();
  const { data } = await db.from("categories").select("*").eq("id", id).maybeSingle();
  return (data as Category) ?? null;
}

export async function listSubcategories(categoryId: number) {
  const db = await getDb();
  const { data } = await db
    .from("subcategories")
    .select("*")
    .eq("category_id", categoryId)
    .order("sort_order")
    .order("name");
  return (data ?? []) as Subcategory[];
}

export async function getSubcategory(id: number): Promise<Subcategory | null> {
  const db = await getDb();
  const { data } = await db.from("subcategories").select("*").eq("id", id).maybeSingle();
  return (data as Subcategory) ?? null;
}

export async function listProductsBySubcategory(subcategoryId: number) {
  const db = await getDb();
  const { data } = await db
    .from("products")
    .select("*")
    .eq("is_active", true)
    .eq("subcategory_id", subcategoryId)
    .order("name");
  return (data ?? []) as Product[];
}

export async function listProducts(categoryId: number | null) {
  const db = await getDb();
  let query = db.from("products").select("*").eq("is_active", true).order("name");
  if (categoryId != null) query = query.eq("category_id", categoryId);
  const { data } = await query;
  return (data ?? []) as Product[];
}

export async function getProduct(id: number): Promise<Product | null> {
  const db = await getDb();
  const { data } = await db.from("products").select("*").eq("id", id).maybeSingle();
  return (data as Product) ?? null;
}

export type CartRow = { id: number; quantity: number; product: Product };

export async function getCart(userId: number): Promise<CartRow[]> {
  const db = await getDb();
  const { data } = await db
    .from("cart_items")
    .select("id, quantity, products(*)")
    .eq("user_id", userId)
    .order("id");
  return ((data ?? []) as unknown as { id: number; quantity: number; products: Product }[])
    .filter((row) => row.products)
    .map((row) => ({ id: row.id, quantity: row.quantity, product: row.products }));
}

export async function addToCart(userId: number, productId: number, quantity = 1) {
  const db = await getDb();
  const { data: existing } = await db
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", userId)
    .eq("product_id", productId)
    .maybeSingle();
  if (existing) {
    await db.from("cart_items").update({ quantity: existing.quantity + quantity }).eq("id", existing.id);
    return;
  }
  await db.from("cart_items").insert({ user_id: userId, product_id: productId, quantity });
}

export function cartTotal(rows: CartRow[]): number {
  return rows.reduce((sum, row) => sum + Number(row.product.price) * row.quantity, 0);
}

export function cartText(rows: CartRow[]): string {
  if (rows.length === 0) return "🛒 <b>Your cart is empty.</b>";
  const lines = rows.map(
    (row) => `• ${escapeHtml(row.product.name)} × ${row.quantity} — <b>${money(Number(row.product.price) * row.quantity)}</b>`,
  );
  return ["🛒 <b>Your cart</b>", "", ...lines, "", `Total: <b>${money(cartTotal(rows))}</b>`].join("\n");
}

export function cartKeyboard(rows: CartRow[]): InlineKeyboard {
  const buttons: InlineKeyboard = rows.map((row) => [
    { text: `🗑 Remove ${row.product.name}`.slice(0, 60), callback_data: `cart:del:${row.id}` },
  ]);
  if (rows.length > 0) buttons.push([{ text: "✅ Checkout", callback_data: "cart:checkout" }]);
  buttons.push([{ text: "🛍 Continue shopping", callback_data: "shop" }], [{ text: "⬅️ Menu", callback_data: "menu" }]);
  return buttons;
}

export type CheckoutResult =
  | { ok: false; reason: string }
  | { ok: true; orderId: number; total: number; balance: number; delivery: string[] };

export async function checkout(user: BotUser): Promise<CheckoutResult> {
  const db = await getDb();
  const { data, error } = await db.rpc("checkout_cart", { p_user_id: user.id });

  if (error || !data) {
    const reason = error?.message?.replace(/^.*?:\s*/, "") || "Could not complete checkout. Please try again.";
    return { ok: false, reason };
  }

  const result = data as unknown as {
    orderId: number;
    total: number;
    balance: number;
    delivery: { name: string; asset: string }[];
  };

  return {
    ok: true,
    orderId: Number(result.orderId),
    total: Number(result.total),
    balance: Number(result.balance),
    delivery: result.delivery.map(
      (item) => `<b>${escapeHtml(item.name)}</b>\n<code>${escapeHtml(item.asset)}</code>`,
    ),
  };
}

export async function listOrders(userId: number) {
  const db = await getDb();
  const { data } = await db
    .from("orders")
    .select("id, total_amount, status, dispute_status, created_at")
    .eq("user_id", userId)
    .order("id", { ascending: false })
    .limit(15);
  return (data ?? []) as {
    id: number;
    total_amount: number;
    status: string;
    dispute_status: string;
    created_at: string;
  }[];
}

export async function orderDetail(userId: number, orderId: number) {
  const db = await getDb();
  const { data } = await db
    .from("orders")
    .select("id, total_amount, status, dispute_status, created_at, order_items(product_name, quantity, price, delivered_asset)")
    .eq("id", orderId)
    .eq("user_id", userId)
    .maybeSingle();
  return data as
    | {
        id: number;
        total_amount: number;
        status: string;
        dispute_status: string;
        created_at: string;
        order_items: { product_name: string; quantity: number; price: number; delivered_asset: string | null }[];
      }
    | null;
}
