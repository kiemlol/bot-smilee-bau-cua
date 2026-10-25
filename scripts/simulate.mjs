// Local simulation without a Zalo token: node scripts/simulate.mjs
// Sends: start -> choose Cua -> bet 50, prints every reply the bot would send.
import { handleInput } from "../lib/game.js";
import * as zalo from "../lib/zalo.js";
const req = { headers: { host: "localhost:3000", "x-forwarded-proto": "http" } };
const chatId = "test-user-1";
for (const step of [
  { rawText: "Bầu cua" },
  { rawText: "Cua" },
  { rawText: "50" },
]) {
  console.log("\n> USER:", step.rawText);
  const replies = await handleInput({ chatId, displayName: "Test", ...step, callbackData: "" }, req, zalo);
  for (const r of replies) console.log("BOT:", JSON.stringify(r, null, 1));
}
