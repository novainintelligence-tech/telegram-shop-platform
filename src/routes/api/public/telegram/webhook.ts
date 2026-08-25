import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";

export function deriveWebhookSecret(botToken: string): string {
  return createHash("sha256").update(`telegram-webhook:${botToken}`).digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export const Route = createFileRoute("/api/public/telegram/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const botToken = process.env["TELEGRAM_BOT_TOKEN"];
        if (!botToken) return new Response("Bot not configured", { status: 503 });

        const provided = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
        if (!safeEqual(provided, deriveWebhookSecret(botToken))) {
          return new Response("Unauthorized", { status: 401 });
        }

        let update: Record<string, unknown>;
        try {
          update = (await request.json()) as Record<string, unknown>;
        } catch {
          return new Response("Bad request", { status: 400 });
        }

        const updateId = update["update_id"];
        if (typeof updateId !== "number") return Response.json({ ok: true, ignored: true });

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { error: dedupeError } = await supabaseAdmin
          .from("telegram_updates")
          .insert({ update_id: updateId });
        if (dedupeError) return Response.json({ ok: true, duplicate: true });

        try {
          const { handleUpdate } = await import("@/lib/store/bot.server");
          await handleUpdate(update);
        } catch (error) {
          console.error("[telegram-webhook] handler failed", error);
        }
        return Response.json({ ok: true });
      },
    },
  },
});