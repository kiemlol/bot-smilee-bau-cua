// Outbound calls to the Zalo Bot API.
// VERIFIED 25/10/2026 from Go SDK source (nduyhai/go-zalo-bot-api,
// client.go): DefaultBaseURL = "https://bot-api.zapps.me" and
// endpoint(path) = "<base>/bot<token>/<path>" — Telegram-style,
// NO Authorization header. The previous code posted to
// https://bot-api.zaloplatforms.com/sendMessage with a Bearer
// header, which is why the real test at 22:08 on 25/10 reached the
// webhook (Vercel Runtime Log POST /api/webhook) but the user
// never received the board photo: the outbound send failed.
// ZALO_API_BASE_URL still overrides the default, so it must be
// set to https://bot-api.zapps.me (or removed) on Vercel.
const base = () => (process.env.ZALO_API_BASE_URL || "https://bot-api.zapps.me").replace(/\/$/, "");
const token = () => process.env.ZALO_BOT_TOKEN || "";

export function zaloConfigured() {
  return Boolean(base() && token());
}

async function call(method, body) {
  if (!zaloConfigured()) return { sent: false, reason: "zalo not configured (ZALO_API_BASE_URL / ZALO_BOT_TOKEN missing)" };
  try {
    const res = await fetch(`${base()}/bot${token()}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "User-Agent": "bot-smilee-bau-cua" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let data = null; try { data = JSON.parse(text); } catch {}
    if (!res.ok) return { sent: false, method, status: res.status, error: text.slice(0, 500) };
    return { sent: true, method, data };
  } catch (e) {
    return { sent: false, method, error: e.message };
  }
}

// Optional inline buttons. Zalo Bot API button support is NOT yet
// verified in public docs, so this is OFF by default
// (ZALO_KEYBOARD=1 to try it). With it off, the game is fully
// playable by typing the animal name or its number, and the amount.
function keyboard(rows) {
  if (process.env.ZALO_KEYBOARD !== "1") return undefined;
  return { inline_keyboard: rows.map((r) => r.map(([text, data]) => ({ text, callback_data: data }))) };
}
export const keyboards = {
  animals: () => keyboard([
    [["🎃 Bầu", "BET_BAU"], ["🦀 Cua", "BET_CUA"], ["🦐 Tôm", "BET_TOM"]],
    [["🐟 Cá", "BET_CA"], ["🐓 Gà", "BET_GA"], ["🦌 Nai", "BET_NAI"]],
  ]),
  amounts: () => keyboard([
    [["10 xu", "AMOUNT_10"], ["50 xu", "AMOUNT_50"]],
    [["100 xu", "AMOUNT_100"], ["200 xu", "AMOUNT_200"], ["❌ Hủy", "CANCEL"]],
  ]),
  again: () => keyboard([
    [["🎲 Chơi tiếp", "PLAY_AGAIN"], ["💰 Xem xu", "BALANCE"]],
  ]),
};

export async function sendText(chatId, text, replyMarkup) {
  const body = { chat_id: chatId, text };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return call("sendMessage", body);
}
export async function sendPhoto(chatId, photoUrl, caption, replyMarkup) {
  const body = { chat_id: chatId, photo: photoUrl, caption };
  if (replyMarkup) body.reply_markup = replyMarkup;
  return call("sendPhoto", body);
}
