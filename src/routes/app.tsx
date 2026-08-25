import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Copy, Loader2, ShoppingCart, Wallet } from "lucide-react";
import {
  miniappAddToCart,
  miniappBootstrap,
  miniappCheckout,
  miniappRemoveFromCart,
  miniappSubmitHash,
  miniappTopUp,
} from "@/lib/store/miniapp.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/app")({
  head: () => ({
    meta: [
      { title: "Store App — Enroll Log" },
      { name: "description", content: "Browse the catalog, top up your balance with crypto and buy digital goods inside Telegram." },
      { property: "og:title", content: "Store App — Enroll Log" },
      { property: "og:description", content: "Browse the catalog, top up with BTC, USDT or USDC and buy instantly inside Telegram." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    scripts: [{ src: "https://telegram.org/js/telegram-web-app.js" }],
  }),
  component: MiniApp,
  ssr: false,
});

type Boot = Awaited<ReturnType<typeof miniappBootstrap>>;
type Invoice = Awaited<ReturnType<typeof miniappTopUp>>;
type Tab = "shop" | "cart" | "wallet" | "orders";

const ASSETS = [
  { id: "BTC", label: "Bitcoin (BTC)" },
  { id: "USDT_TRC20", label: "USDT · TRC20" },
  { id: "USDC_ERC20", label: "USDC · Ethereum" },
] as const;

function usd(value: number) {
  return `$${Number(value).toFixed(2)}`;
}

function Banner({ image, title, subtitle }: { image?: string | null; title: string; subtitle?: string | null }) {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-border bg-card">
      {image ? (
        <img src={image} alt={title} loading="lazy" className="h-36 w-full object-cover" />
      ) : (
        <div className="h-24 w-full bg-gradient-to-br from-primary/30 to-card" />
      )}
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-background/95 to-transparent p-3">
        <p className="text-base font-semibold">{title}</p>
        {subtitle ? <p className="line-clamp-2 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}

function MiniApp() {
  const bootstrap = useServerFn(miniappBootstrap);
  const addToCartFn = useServerFn(miniappAddToCart);
  const removeFn = useServerFn(miniappRemoveFromCart);
  const checkoutFn = useServerFn(miniappCheckout);
  const topUpFn = useServerFn(miniappTopUp);
  const submitHashFn = useServerFn(miniappSubmitHash);

  const [initData, setInitData] = useState<string | null>(null);
  const [data, setData] = useState<Boot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("shop");
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [subcategoryId, setSubcategoryId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const [asset, setAsset] = useState<(typeof ASSETS)[number]["id"]>("BTC");
  const [amount, setAmount] = useState("20");
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [hash, setHash] = useState("");

  useEffect(() => {
    const tg = (window as unknown as { Telegram?: { WebApp?: any } }).Telegram?.WebApp;
    tg?.ready?.();
    tg?.expand?.();
    const value = tg?.initData as string | undefined;
    if (!value) {
      setError("Open this page from the Telegram bot to sign in.");
      return;
    }
    setInitData(value);
  }, []);

  const refresh = useCallback(
    async (value: string) => {
      try {
        setData(await bootstrap({ data: { initData: value } }));
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not load the store");
      }
    },
    [bootstrap],
  );

  useEffect(() => {
    if (initData) void refresh(initData);
  }, [initData, refresh]);

  const run = useCallback(
    async (fn: () => Promise<void>) => {
      setBusy(true);
      setNotice(null);
      try {
        await fn();
      } catch (e) {
        setNotice(e instanceof Error ? e.message : "Something went wrong");
      } finally {
        setBusy(false);
      }
    },
    [],
  );

  const visibleProducts = useMemo(() => {
    if (!data) return [];
    if (subcategoryId) return data.products.filter((p) => p.subcategory_id === subcategoryId);
    if (categoryId) return data.products.filter((p) => p.category_id === categoryId && !p.subcategory_id);
    return data.products;
  }, [data, categoryId, subcategoryId]);

  const category = data?.categories.find((c) => c.id === categoryId) ?? null;
  const subcategory = category?.subcategories.find((s) => s.id === subcategoryId) ?? null;

  if (error && !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-8 text-center">
        <h1 className="text-lg font-semibold">Store app</h1>
        <p className="text-sm text-muted-foreground">{error}</p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="flex min-h-screen items-center justify-center">
        <Loader2 className="size-6 animate-spin text-primary" />
      </main>
    );
  }

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-lg flex-col gap-4 p-4 pb-24">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold">{data.store.name}</h1>
          <p className="text-xs text-muted-foreground">Hi {data.user.first_name ?? "there"} 👋</p>
        </div>
        <div className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-semibold">
          {usd(data.user.balance)}
        </div>
      </header>

      {notice ? <p className="rounded-lg border border-border bg-card p-3 text-sm">{notice}</p> : null}

      {tab === "shop" ? (
        <section className="flex flex-col gap-4">
          {subcategory ? (
            <>
              <button className="flex items-center gap-1 text-sm text-muted-foreground" onClick={() => setSubcategoryId(null)}>
                <ArrowLeft className="size-4" /> {category?.name}
              </button>
              <Banner image={subcategory.image_url} title={subcategory.name} subtitle={subcategory.description} />
            </>
          ) : category ? (
            <>
              <button
                className="flex items-center gap-1 text-sm text-muted-foreground"
                onClick={() => setCategoryId(null)}
              >
                <ArrowLeft className="size-4" /> All categories
              </button>
              <Banner image={category.image_url} title={category.name} subtitle={category.description} />
              {category.subcategories.length > 0 ? (
                <div className="grid grid-cols-2 gap-3">
                  {category.subcategories.map((sub) => (
                    <button key={sub.id} className="text-left" onClick={() => setSubcategoryId(sub.id)}>
                      <Banner image={sub.image_url} title={sub.name} subtitle={sub.description} />
                    </button>
                  ))}
                </div>
              ) : null}
            </>
          ) : (
            <>
              <Banner image={data.store.banner} title={data.store.name} subtitle={data.store.welcome} />
              <div className="grid grid-cols-2 gap-3">
                {data.categories.map((c) => (
                  <button key={c.id} className="text-left" onClick={() => setCategoryId(c.id)}>
                    <Banner image={c.image_url} title={c.name} subtitle={c.description} />
                  </button>
                ))}
              </div>
            </>
          )}

          <div className="flex flex-col gap-3">
            {visibleProducts.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing here yet.</p>
            ) : null}
            {visibleProducts.map((product) => (
              <article key={product.id} className="overflow-hidden rounded-2xl border border-border bg-card">
                {product.image_url ? (
                  <img src={product.image_url} alt={product.name} loading="lazy" className="h-40 w-full object-cover" />
                ) : null}
                <div className="flex flex-col gap-2 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="font-semibold">{product.name}</p>
                    <span className="shrink-0 font-semibold text-primary">{usd(product.price)}</span>
                  </div>
                  {product.description ? (
                    <p className="line-clamp-3 text-sm text-muted-foreground">{product.description}</p>
                  ) : null}
                  <Button
                    disabled={busy || !product.in_stock}
                    onClick={() =>
                      run(async () => {
                        await addToCartFn({ data: { initData: initData!, productId: product.id } });
                        await refresh(initData!);
                        setNotice(`${product.name} added to your cart.`);
                      })
                    }
                  >
                    {product.in_stock ? "Add to cart" : "Out of stock"}
                  </Button>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {tab === "cart" ? (
        <section className="flex flex-col gap-3">
          {data.cart.length === 0 ? <p className="text-sm text-muted-foreground">Your cart is empty.</p> : null}
          {data.cart.map((row) => (
            <div key={row.id} className="flex items-center justify-between gap-3 rounded-xl border border-border bg-card p-3">
              <div>
                <p className="text-sm font-medium">
                  {row.product.name} × {row.quantity}
                </p>
                <p className="text-xs text-muted-foreground">{usd(row.product.price * row.quantity)}</p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    await removeFn({ data: { initData: initData!, cartItemId: row.id } });
                    await refresh(initData!);
                  })
                }
              >
                Remove
              </Button>
            </div>
          ))}
          {data.cart.length > 0 ? (
            <>
              <p className="text-right text-sm font-semibold">Total {usd(data.cartTotal)}</p>
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const result = await checkoutFn({ data: { initData: initData! } });
                    await refresh(initData!);
                    setNotice(result.ok ? `Order #${result.orderId} completed — check the bot chat for your items.` : result.reason);
                    if (result.ok) setTab("orders");
                  })
                }
              >
                Pay with balance
              </Button>
            </>
          ) : null}
        </section>
      ) : null}

      {tab === "wallet" ? (
        <section className="flex flex-col gap-3">
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="text-2xl font-semibold">{usd(data.user.balance)}</p>
          </div>

          {invoice ? (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">
                Send exactly {invoice.amount} {invoice.assetLabel}
              </p>
              <p className="text-xs text-muted-foreground">{invoice.network} · invoice {invoice.code} · {usd(invoice.amountUsd)}</p>
              <button
                className="flex items-center justify-between gap-2 rounded-lg border border-border p-2 text-left text-xs break-all"
                onClick={() => navigator.clipboard?.writeText(invoice.address)}
              >
                {invoice.address}
                <Copy className="size-4 shrink-0" />
              </button>
              <Input placeholder="Transaction hash (TxID)" value={hash} onChange={(e) => setHash(e.target.value)} />
              <Button
                disabled={busy || hash.trim().length < 6}
                onClick={() =>
                  run(async () => {
                    const result = await submitHashFn({ data: { initData: initData!, txId: invoice.id, hash } });
                    setNotice(result.message);
                    setHash("");
                    if (result.status === "credited") setInvoice(null);
                    await refresh(initData!);
                  })
                }
              >
                Submit hash
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setInvoice(null)}>
                New invoice
              </Button>
            </div>
          ) : (
            <div className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-4">
              <p className="text-sm font-semibold">Top up</p>
              <div className="grid grid-cols-3 gap-2">
                {ASSETS.map((a) => (
                  <Button key={a.id} variant={asset === a.id ? "default" : "outline"} size="sm" onClick={() => setAsset(a.id)}>
                    {a.id.split("_")[0]}
                  </Button>
                ))}
              </div>
              <Input
                inputMode="decimal"
                placeholder={`Amount in USD (min ${usd(data.store.min_topup)})`}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <Button
                disabled={busy}
                onClick={() =>
                  run(async () => {
                    const created = await topUpFn({
                      data: { initData: initData!, asset, amountUsd: Number(amount) },
                    });
                    setInvoice(created);
                  })
                }
              >
                Create invoice
              </Button>
            </div>
          )}
        </section>
      ) : null}

      {tab === "orders" ? (
        <section className="flex flex-col gap-3">
          {data.orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : null}
          {data.orders.map((order) => (
            <div key={order.id} className="rounded-xl border border-border bg-card p-3 text-sm">
              <p className="font-medium">Order #{order.id}</p>
              <p className="text-xs text-muted-foreground">
                {usd(Number(order.total_amount))} · {order.status} · {new Date(order.created_at).toLocaleDateString()}
              </p>
            </div>
          ))}
        </section>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 mx-auto flex w-full max-w-lg items-center justify-around border-t border-border bg-background/95 p-2 backdrop-blur">
        {([
          ["shop", "Shop", ShoppingCart],
          ["cart", `Cart${data.cart.length ? ` (${data.cart.length})` : ""}`, ShoppingCart],
          ["wallet", "Wallet", Wallet],
          ["orders", "Orders", Wallet],
        ] as const).map(([id, label]) => (
          <button
            key={id}
            className={`rounded-lg px-3 py-2 text-xs font-medium ${tab === id ? "bg-primary/15 text-primary" : "text-muted-foreground"}`}
            onClick={() => setTab(id as Tab)}
          >
            {label}
          </button>
        ))}
      </nav>
    </main>
  );
}
