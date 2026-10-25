import { handleInput } from "../lib/game.js";
import { alreadyProcessed } from "../lib/db.js";
import * as zalo from "../lib/zalo.js";

// POST /api/webhook - Zalo Bot API webhook.
// Verify: if ZALO_WEBHOOK_SECRET is set, Zalo must send it back in
// header X-Bot-Api-Secret-Token (same value Khương set in the bot's
// "Secret Token" field in the screenshot). Mismatch -> 401, no game state changes.
export default async function handler(req, res) {
  if (req.method === "GET") {
    return res.status(200).json({ ok: true, service: "bot-smilee-bau-cua", webhook: "/api/webhook", db: (await import("../lib/db.js")).dbMode() });
  }
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "method not allowed" });

  const secret = process.env.ZALO_WEBHOOK_SECRET || "";
  if (secret) {
    const got = req.headers["x-bot-api-secret-token"] || req.headers["x-telegram-bot-api-secret-token"] || "";
    if (got !== secret) return res.status(401).json({ ok: false, error: "bad secret token" });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  // Zalo Bot API wraps the event in `result`; accept flat bodies too.
  // Go/Node SDK shape: result.event_name, result.message.{chat.id, text, from.display_name}
  // PHP SDK shape (different normalisation): event=user_text, chatId, userId, message.text
  const event = body.result || body;
  const msg = event.message || event.callback_query?.message || event;
  const msgText = typeof msg === "object" ? (msg.text ?? msg.caption ?? "") : "";
  const chatId = msg.chat?.id ?? msg.chat_id ?? msg.chatId ?? event.chat_id ?? event.chatId ?? msg.from?.id ?? event.userId;
  const text = msgText || (typeof event.message === "object" ? (event.message.text ?? "") : "");
  const callbackData = event.callback_query?.data || msg.callback_data || event.data || "";
  const displayName = msg.from?.display_name || msg.from?.first_name || event.userName || "";
  const messageId = msg.message_id || event.message_id || "";

  if (!chatId) return res.status(200).json({ ok: true, ignored: true, reason: "no chat id in payload" });
  if (await alreadyProcessed(messageId)) return res.status(200).json({ ok: true, duplicate: true });

  const replies = await handleInput({ chatId, displayName, rawText: text, callbackData }, req, zalo);

  const sent = [];
  for (const r of replies) {
    if (r.type === "video") {
      const res = await zalo.sendVideo(String(chatId), r.video, r.caption, r.replyMarkup);
      try { res.photo = String(r.video).split("/").pop(); } catch {}
      sent.push(res);
      // Same fallback as photos: if Zalo has no sendVideo, the
      // caption still arrives as text and the result follows.
      if (!res.sent && r.caption) sent.push(await zalo.sendText(String(chatId), r.caption, r.replyMarkup));
    }
    else if (r.type === "photo") {
      const res = await zalo.sendPhoto(String(chatId), r.photo, r.caption, r.replyMarkup);
      // Tag the photo filename on the result so the Runtime Log can
      // tell a board send apart from a GIF send (both are sendPhoto).
      try { res.photo = String(r.photo).split("/").pop(); } catch {}
      sent.push(res);
      // If the photo itself fails (e.g. Zalo cannot fetch the GIF
      // URL), still send its caption as text so the player is not
      // left staring at a gap before the result text.
      if (!res.sent && r.caption) sent.push(await zalo.sendText(String(chatId), r.caption, r.replyMarkup));
    }
    else sent.push(await zalo.sendText(String(chatId), r.text, r.replyMarkup));
  }
  // Minimal send summary for Vercel Runtime Logs (no tokens, no
  // message text): lets the next "no GIF / no reply" report be
  // diagnosed from the log instead of guessed at.
  try { console.log(JSON.stringify({ webhook: "sent", sent: sent.map((s) => ({ method: s.method, photo: s.photo || null, sent: s.sent, status: s.status || null, error: s.error ? String(s.error).slice(0, 200) : null })) })); } catch {}
  // If Zalo is not configured yet, `sent` explains why, and `replies`
  // still shows exactly what the bot WOULD send - so Khương can test
  // the whole game with curl before connecting a real token.
  return res.status(200).json({ ok: true, chat_id: String(chatId), replies, sent });
}
