import { createFileRoute, Link } from "@tanstack/react-router";
import { Bitcoin, Bot, ShieldCheck, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Enroll Log" },
      {
        name: "description",
        content:
          "A Telegram digital goods store with manual crypto checkout: wallet addresses, transaction hash submission, and automatic on-chain confirmation.",
      },
      { property: "og:title", content: "Enroll Log" },
      {
        property: "og:description",
        content: "A Telegram digital goods store with manual crypto checkout: wallet addresses, transaction hash submission, and automatic on-chain confirmation.",
      },
    ],
  }),
  component: Index,
});

const COINS = [
  { name: "Bitcoin", network: "Bitcoin mainnet", ticker: "BTC" },
  { name: "Tether", network: "TRON · TRC20", ticker: "USDT" },
  { name: "USD Coin", network: "Ethereum · ERC20", ticker: "USDC" },
];

function Index() {
  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col justify-center gap-12 px-6 py-16">
      <header className="space-y-6">
        <span className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-xs uppercase tracking-widest text-muted-foreground">
          <Bot className="size-3.5 text-primary" /> Telegram store bot
        </span>
        <h1 className="text-4xl leading-tight font-bold sm:text-6xl">
          Sell digital goods on Telegram, paid in <span className="text-primary">your own</span> crypto wallets.
        </h1>
        <p className="max-w-2xl text-lg text-muted-foreground">
          Customers top up an internal balance by sending BTC, USDT (TRC20) or USDC (Ethereum) directly to your
          addresses, then submit the transaction hash. Payments confirm automatically on-chain, or manually from the
          admin console.
        </p>
        <div className="flex flex-wrap gap-3">
          <Button asChild size="lg">
            <a href="https://t.me/Enroll_Logsbot" target="_blank" rel="noreferrer">
              Open the bot
            </a>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link to="/dashboard">Admin console</Link>
          </Button>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-3">
        {COINS.map((coin) => (
          <div key={coin.ticker} className="panel vault-gradient p-5">
            <p className="font-display text-2xl">{coin.ticker}</p>
            <p className="mt-1 text-sm text-foreground">{coin.name}</p>
            <p className="text-xs text-muted-foreground">{coin.network}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-4 sm:grid-cols-3">
        {[
          { icon: Wallet, title: "Direct to your wallets", body: "No processor, no custody — funds land in your addresses." },
          { icon: ShieldCheck, title: "Automatic confirmation", body: "Hashes are verified on-chain before balances move." },
          { icon: Bitcoin, title: "Manual fallback", body: "Approve or reject any payment from Telegram or the console." },
        ].map((item) => (
          <div key={item.title} className="panel p-5">
            <item.icon className="size-5 text-primary" />
            <h2 className="mt-3 text-base font-semibold">{item.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
          </div>
        ))}
      </section>
    </main>
  );
}
