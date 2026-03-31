import app from "./app";
import { logger } from "./lib/logger";
import { createBot } from "./bot/index";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error("PORT environment variable is required but was not provided.");
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const WEBHOOK_PATH = "/bot-webhook";

const bot = createBot();

// Mount webhook handler on Express — Telegram will POST updates here directly
app.post(WEBHOOK_PATH, bot.webhookCallback(WEBHOOK_PATH));

app.listen(port, () => {
  logger.info({ port }, "Server listening");
  setupBot().catch((err) => {
    logger.error({ err }, "Bot setup failed");
    process.exit(1);
  });
});

async function setupBot(): Promise<void> {
  // Support multiple environments:
  //   WEBHOOK_DOMAIN      — set manually on any host (e.g. Railway custom domain)
  //   RAILWAY_PUBLIC_DOMAIN — set automatically by Railway
  //   REPLIT_DOMAINS      — set automatically by Replit
  const domain =
    process.env["WEBHOOK_DOMAIN"] ||
    process.env["RAILWAY_PUBLIC_DOMAIN"] ||
    process.env["REPLIT_DOMAINS"]?.split(",")[0].trim();

  if (domain) {
    const webhookUrl = `https://${domain}${WEBHOOK_PATH}`;
    try {
      await bot.telegram.setWebhook(webhookUrl, {
        drop_pending_updates: true,
        allowed_updates: ["message", "callback_query"],
      });
      logger.info({ webhookUrl }, "Webhook set — bot is ready (instant responses)");
    } catch (err) {
      logger.warn({ err }, "Failed to set webhook, falling back to long polling");
      startPolling();
    }
  } else {
    logger.info("No public domain found — using long polling");
    startPolling();
  }
}

function startPolling(): void {
  bot
    .launch({
      dropPendingUpdates: true,
      allowedUpdates: ["message", "callback_query"],
    })
    .catch((err) => {
      logger.error({ err }, "Long polling failed");
      process.exit(1);
    });
}

process.once("SIGINT", async () => {
  try {
    await bot.telegram.deleteWebhook();
  } catch {}
  bot.stop("SIGINT");
});

process.once("SIGTERM", async () => {
  try {
    await bot.telegram.deleteWebhook();
  } catch {}
  bot.stop("SIGTERM");
});
