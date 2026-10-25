import { dbMode } from "../lib/db.js";
import { zaloConfigured } from "../lib/zalo.js";
export default async function handler(req, res) {
  res.status(200).json({
    ok: true,
    service: "bot-smilee-bau-cua",
    db: dbMode(),
    zaloConfigured: zaloConfigured(),
    // Never return token/secret values here.
    hasWebhookSecret: Boolean(process.env.ZALO_WEBHOOK_SECRET),
    keyboard: process.env.ZALO_KEYBOARD === "1" ? "on (experimental)" : "off",
  });
}
