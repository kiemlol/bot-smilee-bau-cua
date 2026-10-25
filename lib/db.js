// Vercel Postgres (Postgres) storage for xu.
// Env: POSTGRES_URL (set automatically when a Vercel Postgres store is
// connected to the project) or DATABASE_URL. If neither is set, the
// server falls back to in-memory storage SO LOCAL TESTS WORK, but that
// fallback MUST NOT be used in production on Vercel: serverless
// instances do not share memory and it resets on every cold start.
import { STARTING_BALANCE } from "./animals.js";

let pool = null;
let poolTried = false;
const mem = new Map(); // userId -> { user_id, display_name, balance, pending_animal }
const memRounds = [];
const memProcessed = new Set();

export function dbMode() {
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
  if (url) return "postgres";
  return "memory";
}

async function getPool() {
  if (poolTried) return pool;
  poolTried = true;
  const url = process.env.POSTGRES_URL || process.env.DATABASE_URL || "";
  if (!url) return null;
  try {
    const { Pool } = await import("pg");
    pool = new Pool({ connectionString: url, ssl: { rejectUnauthorized: false }, max: 3 });
    await pool.query(`
      CREATE TABLE IF NOT EXISTS bau_cua_users (
        user_id TEXT PRIMARY KEY,
        display_name TEXT,
        balance INT NOT NULL DEFAULT ${STARTING_BALANCE},
        pending_animal TEXT,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bau_cua_rounds (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        animal TEXT NOT NULL,
        amount INT NOT NULL,
        results JSONB NOT NULL,
        win_count INT NOT NULL,
        profit INT NOT NULL,
        balance_after INT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE TABLE IF NOT EXISTS bau_cua_processed (
        message_id TEXT PRIMARY KEY,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);
  } catch (e) {
    console.error("postgres init failed, falling back to memory:", e.message);
    pool = null;
  }
  return pool;
}

export async function alreadyProcessed(messageId) {
  if (!messageId) return false;
  const p = await getPool();
  if (p) {
    const r = await p.query("INSERT INTO bau_cua_processed(message_id) VALUES($1) ON CONFLICT DO NOTHING RETURNING message_id", [messageId]);
    return r.rowCount === 0;
  }
  if (memProcessed.has(messageId)) return true;
  memProcessed.add(messageId);
  return false;
}

export async function getUser(userId, displayName) {
  const p = await getPool();
  if (p) {
    const r = await p.query(
      "INSERT INTO bau_cua_users(user_id, display_name, balance) VALUES($1,$2,$3) ON CONFLICT (user_id) DO UPDATE SET display_name = COALESCE(EXCLUDED.display_name, bau_cua_users.display_name) RETURNING *",
      [userId, displayName || null, STARTING_BALANCE]
    );
    return r.rows[0];
  }
  if (!mem.has(userId)) mem.set(userId, { user_id: userId, display_name: displayName || null, balance: STARTING_BALANCE, pending_animal: null });
  return mem.get(userId);
}

export async function setPending(userId, animal) {
  const p = await getPool();
  if (p) await p.query("UPDATE bau_cua_users SET pending_animal=$2, updated_at=NOW() WHERE user_id=$1", [userId, animal]);
  else { const u = mem.get(userId); if (u) u.pending_animal = animal; }
}

export async function clearPending(userId) {
  const p = await getPool();
  if (p) await p.query("UPDATE bau_cua_users SET pending_animal=NULL, updated_at=NOW() WHERE user_id=$1", [userId]);
  else { const u = mem.get(userId); if (u) u.pending_animal = null; }
}

// Resolve one bet atomically: check balance, deduct stake, add winnings, log round.
// Returns { ok, balance, winCount, profit } or { ok:false, reason }
export async function resolveBet(userId, animal, amount, results) {
  const winCount = results.filter((r) => r === animal).length;
  const p = await getPool();
  if (p) {
    const client = await p.connect();
    try {
      await client.query("BEGIN");
      const r = await client.query("SELECT balance, pending_animal FROM bau_cua_users WHERE user_id=$1 FOR UPDATE", [userId]);
      if (!r.rows.length) throw new Error("user not found");
      const balance = r.rows[0].balance;
      if (balance < amount) { await client.query("ROLLBACK"); return { ok: false, reason: "insufficient", balance }; }
      const profit = winCount > 0 ? winCount * amount : -amount;
      const after = balance + profit;
      await client.query("UPDATE bau_cua_users SET balance=$2, pending_animal=NULL, updated_at=NOW() WHERE user_id=$1", [userId, after]);
      await client.query(
        "INSERT INTO bau_cua_rounds(user_id, animal, amount, results, win_count, profit, balance_after) VALUES($1,$2,$3,$4,$5,$6,$7)",
        [userId, animal, amount, JSON.stringify(results), winCount, profit, after]
      );
      await client.query("COMMIT");
      return { ok: true, balance: after, winCount, profit };
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally { client.release(); }
  }
  const u = mem.get(userId);
  if (!u) return { ok: false, reason: "user not found" };
  if (u.balance < amount) return { ok: false, reason: "insufficient", balance: u.balance };
  const profit = winCount > 0 ? winCount * amount : -amount;
  u.balance += profit; u.pending_animal = null;
  memRounds.push({ user_id: userId, animal, amount, results, win_count: winCount, profit, balance_after: u.balance });
  return { ok: true, balance: u.balance, winCount, profit };
}
