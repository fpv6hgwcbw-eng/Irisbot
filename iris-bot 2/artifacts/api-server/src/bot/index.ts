import { Telegraf, Markup, session } from "telegraf";
import type { Context } from "telegraf";
import { logger } from "../lib/logger.js";
import {
  loadApplications,
  addApplication,
  deleteApplication,
  clearAllApplications,
  getApplicationByUser,
} from "./storage.js";

const ADMIN_IDS_RAW = process.env["ADMIN_IDS"] ?? "";
const ADMIN_IDS = ADMIN_IDS_RAW.split(",")
  .map((s) => parseInt(s.trim(), 10))
  .filter((n) => !isNaN(n));

interface SessionData {
  step?: "gameId" | "damage" | "comment";
  gameId?: string;
  damage?: number;
}

interface BotContext extends Context {
  session: SessionData;
}

const mainMenu = Markup.keyboard([
  ["📋 Подать заявку", "📜 Список заявок"],
  ["💥 Общий урон", "🏆 Топ по урону"],
]).resize();

function formatList(): string {
  const apps = loadApplications();
  if (apps.length === 0) return "📭 Список заявок пуст.";
  return (
    "📜 *Список заявок:*\n\n" +
    apps
      .map((a, i) => {
        const comment = a.comment ? `\n   💬 ${a.comment}` : "";
        return `${i + 1}. *${escMd(a.displayName)}* (ID: \`${escMd(a.gameId)}\`)\n   💥 Урон: *${a.damage.toLocaleString("ru")}*${comment}`;
      })
      .join("\n\n")
  );
}

function formatTotal(): string {
  const apps = loadApplications();
  if (apps.length === 0) return "📭 Заявок ещё нет.";
  const total = apps.reduce((s, a) => s + a.damage, 0);
  return `💥 *Общий урон:* \`${total.toLocaleString("ru")}\`\n👥 Участников: ${apps.length}`;
}

function formatTop(): string {
  const apps = loadApplications();
  if (apps.length === 0) return "📭 Заявок ещё нет.";
  const sorted = [...apps].sort((a, b) => b.damage - a.damage);
  const medals = ["🥇", "🥈", "🥉"];
  return (
    "🏆 *Топ игроков по урону:*\n\n" +
    sorted
      .map((a, i) => {
        const medal = medals[i] ?? `${i + 1}.`;
        return `${medal} *${escMd(a.displayName)}* — \`${a.damage.toLocaleString("ru")}\``;
      })
      .join("\n")
  );
}

function escMd(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, "\\$&");
}

export function createBot(): Telegraf<BotContext> {
  const token = process.env["TELEGRAM_BOT_TOKEN"];
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const bot = new Telegraf<BotContext>(token);

  bot.use(session({ defaultSession: (): SessionData => ({}) }));

  // Timing middleware — logs when update is received and how fast it's processed
  bot.use((ctx, next) => {
    const start = Date.now();
    const updateId = ctx.update.update_id;
    const type = ctx.updateType;
    const userId = ctx.from?.id;
    logger.info({ updateId, type, userId }, "Update received");
    return next().finally(() => {
      const ms = Date.now() - start;
      logger.info({ updateId, ms }, "Update handled in %dms", ms);
    });
  });

  bot.start((ctx) => {
    const name = ctx.from?.first_name ?? "игрок";
    ctx.session = {};
    return ctx.replyWithMarkdownV2(
      `👋 Привет, *${escMd(name)}*\\!\n\nЯ бот для управления заявками на урон\\. Используй меню ниже\\:`,
      mainMenu,
    );
  });

  bot.hears("📋 Подать заявку", (ctx) => {
    const existing = getApplicationByUser(ctx.from!.id);
    if (existing) {
      return ctx.reply(
        `⚠️ У тебя уже есть заявка (ID: ${existing.gameId}, урон: ${existing.damage.toLocaleString("ru")}).\n\nЧтобы обновить — сначала удали её командой /delete.`,
        mainMenu,
      );
    }
    ctx.session = { step: "gameId" };
    return ctx.reply("🎮 Введи свой игровой ID:", Markup.removeKeyboard());
  });

  bot.hears("📜 Список заявок", (ctx) => {
    ctx.session = {};
    return ctx.replyWithMarkdownV2(formatList(), mainMenu);
  });

  bot.hears("💥 Общий урон", (ctx) => {
    ctx.session = {};
    return ctx.replyWithMarkdownV2(formatTotal(), mainMenu);
  });

  bot.hears("🏆 Топ по урону", (ctx) => {
    ctx.session = {};
    return ctx.replyWithMarkdownV2(formatTop(), mainMenu);
  });

  bot.command("list", (ctx) => {
    ctx.session = {};
    return ctx.replyWithMarkdownV2(formatList(), mainMenu);
  });

  bot.command("total", (ctx) => {
    ctx.session = {};
    return ctx.replyWithMarkdownV2(formatTotal(), mainMenu);
  });

  bot.command("top", (ctx) => {
    ctx.session = {};
    return ctx.replyWithMarkdownV2(formatTop(), mainMenu);
  });

  bot.command("delete", (ctx) => {
    ctx.session = {};
    const deleted = deleteApplication(ctx.from!.id);
    return deleted
      ? ctx.reply("✅ Твоя заявка удалена.", mainMenu)
      : ctx.reply("❌ У тебя нет заявки.", mainMenu);
  });

  bot.command("clear", (ctx) => {
    const userId = ctx.from!.id;
    if (ADMIN_IDS.length > 0 && !ADMIN_IDS.includes(userId)) {
      return ctx.reply("🚫 Эта команда только для администраторов.");
    }
    clearAllApplications();
    return ctx.reply("🗑 Все заявки очищены.", mainMenu);
  });

  bot.on("text", (ctx) => {
    const text = ctx.message.text.trim();
    const step = ctx.session.step;

    if (step === "gameId") {
      if (!text) return ctx.reply("❌ Игровой ID не может быть пустым. Введи ещё раз:");
      ctx.session.gameId = text;
      ctx.session.step = "damage";
      return ctx.reply("💥 Введи планируемый урон (только число):");
    }

    if (step === "damage") {
      const dmg = parseInt(text.replace(/\s/g, ""), 10);
      if (isNaN(dmg) || dmg <= 0) {
        return ctx.reply("❌ Введи корректное число урона (больше 0):");
      }
      ctx.session.damage = dmg;
      ctx.session.step = "comment";
      return ctx.reply('💬 Введи комментарий (или отправь "-" чтобы пропустить):');
    }

    if (step === "comment") {
      const comment = text === "-" ? "" : text;
      const from = ctx.from!;
      const displayName =
        [from.first_name, from.last_name].filter(Boolean).join(" ") ||
        from.username ||
        "Игрок";

      const gameId = ctx.session.gameId!;
      const damage = ctx.session.damage!;

      addApplication({
        userId: from.id,
        username: from.username ?? "",
        displayName,
        gameId,
        damage,
        comment,
      });

      ctx.session = {};
      return ctx.replyWithMarkdownV2(
        `✅ *Заявка принята\\!*\n\n🎮 ID: \`${escMd(gameId)}\`\n💥 Урон: \`${damage.toLocaleString("ru")}\`${comment ? `\n💬 ${escMd(comment)}` : ""}`,
        mainMenu,
      );
    }

    return ctx.reply(
      "Используй меню ниже или команды /list, /total, /top, /delete",
      mainMenu,
    );
  });

  bot.catch((err) => {
    logger.error({ err }, "Bot error");
  });

  return bot;
}
