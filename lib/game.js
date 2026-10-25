// Pure bau cua game flow. Returns a list of outbound messages
// ({type:'text'|'photo', text?, photo?, caption?, replyMarkup?})
// in the order the bot should send them. No Zalo calls here, so
// this file is testable without a token.
import { ANIMALS, AMOUNTS, byKey, roll, stripAccents, parseAnimal, animalListText } from "./animals.js";
import { getUser, setPending, clearPending, resolveBet } from "./db.js";

function baseUrl(req) {
  // Public origin of this deployment, for board/GIF asset URLs.
  const proto = req?.headers?.["x-forwarded-proto"] || "https";
  const host = req?.headers?.["x-forwarded-host"] || req?.headers?.host;
  if (host) return `${proto}://${host}`;
  return process.env.PUBLIC_URL || "";
}
function boardUrl(req) {
  if (process.env.BOARD_URL) return process.env.BOARD_URL;
  return baseUrl(req) ? `${baseUrl(req)}/board.jpg` : "";
}
function gifUrl(req) {
  // GIF lives in the deployment itself (public/bau-cua-shake.gif,
  // served from the git-connected Vercel deployment) — GIF_URL must
  // NOT be set to the old temporary Muse file link anymore, because
  // Zalo cannot reliably fetch that link and the shake GIF then
  // silently disappears (real bug seen 25/10). GIF_URL is kept only
  // as an override for a permanent asset host, if ever needed.
  if (process.env.GIF_URL) return process.env.GIF_URL;
  return baseUrl(req) ? `${baseUrl(req)}/bau-cua-shake.gif` : "";
}

export async function handleInput({ chatId, displayName, rawText, callbackData }, req, zalo) {
  const out = [];
  const text = (rawText || "").trim();
  const data = callbackData || "";
  const user = await getUser(String(chatId), displayName);
  const t = stripAccents(text);

  const sendStart = () => {
    const photo = boardUrl(req);
    const caption = `🎲 BẦU CUA - Ván mới!\n💰 Bạn có ${user.balance} xu.\nChọn 1 con (gõ tên hoặc số):\n${animalListText()}`;
    if (photo) out.push({ type: "photo", photo, caption, replyMarkup: zalo.keyboards.animals() });
    else out.push({ type: "text", text: caption, replyMarkup: zalo.keyboards.animals() });
  };

  // Button payloads (when the platform delivers them) and text equivalents.
  if (data === "PLAY_AGAIN" || t === "choi tiep" || t === "bau cua" || t === "game" || t === "bat dau") { sendStart(); return out; }
  if (data === "BALANCE" || t === "xem xu" || t === "xu" || t === "so du") {
    out.push({ type: "text", text: `💰 Số dư của bạn: ${user.balance} xu.` }); return out;
  }
  if (data === "CANCEL" || t === "huy") {
    await clearPending(String(chatId));
    out.push({ type: "text", text: "Đã hủy ván này. Gõ “Bầu cua” để chơi ván mới." }); return out;
  }

  const betAnimal = data.startsWith("BET_") ? data.slice(4).toLowerCase() : parseAnimal(text);
  if (betAnimal && byKey(betAnimal)) {
    await setPending(String(chatId), betAnimal);
    const a = byKey(betAnimal);
    out.push({ type: "text", text: `Đã chọn ${a.emoji} ${a.label}. Chọn mức cược:`, replyMarkup: zalo.keyboards.amounts() });
    out.push({ type: "text", text: `Mức cược: ${AMOUNTS.map((m) => `${m} xu`).join(" / ")}.\nGõ số tiền, hoặc gõ “hủy”.` });
    return out;
  }

  const amountMatch = data.startsWith("AMOUNT_") ? Number(data.slice(7)) : (AMOUNTS.includes(Number(text)) ? Number(text) : null);
  if (amountMatch && user.pending_animal) {
    const animal = user.pending_animal;
    const a = byKey(animal);
    if (user.balance < amountMatch) {
      out.push({ type: "text", text: `Bạn không đủ xu. Bạn có ${user.balance} xu, cần ${amountMatch} xu.` }); return out;
    }
    const results = roll();
    const res = await resolveBet(String(chatId), animal, amountMatch, results);
    if (!res.ok) { out.push({ type: "text", text: `Không đặt được ván này (${res.reason}).` }); return out; }
    const resultLabels = results.map((r) => `${byKey(r).emoji} ${byKey(r).label}`).join(" - ");
    const gif = gifUrl(req);
    if (gif) out.push({ type: "photo", photo: gif, caption: `Đã đặt ${amountMatch} xu vào ${a.emoji} ${a.label}. Đang lắc...` });
    else out.push({ type: "text", text: `Đã đặt ${amountMatch} xu vào ${a.emoji} ${a.label}. Đang lắc...` });
    let resultText;
    if (res.winCount > 0) {
      resultText = `🎲 Kết quả: ${resultLabels}\n🏆 Người trúng:\n- Bạn: đặt ${a.label} ${amountMatch} xu, trúng ${res.winCount} lần, +${res.profit} xu\n💰 Số dư của bạn: ${res.balance} xu`;
    } else {
      resultText = `🎲 Kết quả: ${resultLabels}\nBạn không trúng ván này, -${amountMatch} xu.\n💰 Số dư của bạn: ${res.balance} xu`;
    }
    out.push({ type: "text", text: resultText, replyMarkup: zalo.keyboards.again() });
    out.push({ type: "text", text: "Gõ “Bầu cua” để chơi tiếp, hoặc “Xem xu” để xem số dư." });
    return out;
  }
  if (amountMatch && !user.pending_animal) {
    out.push({ type: "text", text: "Bạn chưa chọn con. Gõ “Bầu cua” rồi chọn 1 con trước." }); return out;
  }
  // Invalid amount while a bet is pending (e.g. typing 1000 when only
  // 10/50/100/200 are allowed): previously this fell through to the
  // default help text and left the player stuck mid-bet. Now it says
  // so plainly and KEEPS the pending animal, so the player just
  // retypes a valid amount instead of starting over.
  if (user.pending_animal && /^\d+$/.test(text)) {
    const a = byKey(user.pending_animal);
    out.push({ type: "text", text: `Mức cược không hợp lệ. Bạn đang đặt ${a.emoji} ${a.label}, chỉ có các mức: ${AMOUNTS.map((m) => `${m} xu`).join(" / ")}.\nGõ lại số tiền, hoặc gõ “hủy”.` });
    return out;
  }

  // Default: help / start.
  out.push({ type: "text", text: "Chào bạn! Gõ “Bầu cua” để chơi. Gõ “Xem xu” để xem số dư xu ảo." });
  return out;
}
