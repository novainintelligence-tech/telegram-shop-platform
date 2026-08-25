import { createFileRoute } from "@tanstack/react-router";

/** Scheduled sweep: re-checks submitted crypto payments and expires stale invoices. */
export const Route = createFileRoute("/api/public/hooks/verify-payments")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authorization = request.headers.get("authorization") ?? "";
        const apiKey = request.headers.get("x-cron-secret") ?? "";
        const expected = process.env["CRON_SECRET"] ?? "";
        const provided = authorization.startsWith("Bearer ") ? authorization.slice(7) : apiKey;
        if (!expected || provided !== expected) {
          return new Response("Unauthorized", { status: 401 });
        }
        try {
          const { sweepPendingPayments } = await import("@/lib/store/bot.server");
          const result = await sweepPendingPayments();
          return Response.json({ ok: true, ...result });
        } catch (error) {
          console.error("[verify-payments]", error);
          return Response.json({ ok: false, error: "sweep failed" }, { status: 500 });
        }
      },
    },
  },
});
