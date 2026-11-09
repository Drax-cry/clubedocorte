import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import bcrypt from "bcryptjs";
import { randomBytes, createHash } from "node:crypto";
import dns from "node:dns";

dns.setDefaultResultOrder("ipv4first");

export type AppUser = {
  id: string;
  username: string;
  role: "admin" | "barber";
  barberId: string | null;
  mustChangePassword: boolean;
  active: boolean;
};

let pool: Pool | null = null;
let initPromise: Promise<void> | null = null;
let resolvedHost: string | null = null;

export function getPgPool() {
  if (!process.env.POSTGRES_URL) return null;
  if (!pool) {
    const url = new URL(process.env.POSTGRES_URL);
    const ca = process.env.POSTGRES_CA_CERT?.replace(/\\n/g, "\n");
    const ssl = ca
      ? { ca, rejectUnauthorized: true }
      : { rejectUnauthorized: process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === "true" };
    const config = resolvedHost
      ? {
          host: resolvedHost,
          port: Number(url.port || 5432),
          database: decodeURIComponent(url.pathname.replace(/^\//, "")),
          user: decodeURIComponent(url.username),
          password: decodeURIComponent(url.password),
        }
      : { connectionString: process.env.POSTGRES_URL };
    pool = new Pool({ ...config, ssl, max: 8, idleTimeoutMillis: 20_000, connectionTimeoutMillis: 8_000 });
  }
  return pool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, values: unknown[] = []) {
  const db = getPgPool();
  if (!db) throw new Error("POSTGRES_URL não está configurado");
  return db.query<T>(text, values);
}

async function withClient<T>(work: (client: PoolClient) => Promise<T>) {
  const db = getPgPool();
  if (!db) throw new Error("POSTGRES_URL não está configurado");
  const client = await db.connect();
  try {
    return await work(client);
  } finally {
    client.release();
  }
}

export async function ensureDatabase() {
  if (!initPromise) {
    initPromise = (async () => {
      const connection = process.env.POSTGRES_URL;
      if (connection) {
        try {
          const host = new URL(connection).hostname;
          resolvedHost = (await dns.promises.lookup(host, { family: 4 })).address;
        } catch (error) {
          console.warn("[PostgreSQL] IPv4 DNS lookup unavailable; using connection hostname");
        }
      }
      const db = getPgPool();
      if (!db) return;
      const migration = await readFile(join(process.cwd(), "database/migrations/001_initial.sql"), "utf8");
      await db.query(migration);
      await db.query(`
        CREATE TABLE IF NOT EXISTS app_sessions (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
          token_hash text NOT NULL UNIQUE,
          csrf_token text NOT NULL,
          expires_at timestamptz NOT NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS app_sessions_token_idx ON app_sessions(token_hash);
      `);
      const password = process.env.ADMIN_INITIAL_PASSWORD;
      if (!password) throw new Error("ADMIN_INITIAL_PASSWORD não está configurado");
      const existing = await db.query<{ id: string }>("SELECT id FROM app_users WHERE username = $1 LIMIT 1", ["admin"]);
      if (existing.rowCount === 0) {
        if (password.length < 10) throw new Error("ADMIN_INITIAL_PASSWORD deve ter pelo menos 10 caracteres");
        const hash = await bcrypt.hash(password, 12);
        await db.query(
          "INSERT INTO app_users (username, password_hash, role, must_change_password) VALUES ($1, $2, 'admin', true)",
          ["admin", hash],
        );
      }
    })().catch(error => {
      initPromise = null;
      console.error("[PostgreSQL] initialization failed:", error instanceof Error ? error.message : error);
      throw error;
    });
  }
  return initPromise;
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const csrfToken = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 14);
  await query(
    "INSERT INTO app_sessions (user_id, token_hash, csrf_token, expires_at) VALUES ($1, $2, $3, $4)",
    [userId, hashSessionToken(token), csrfToken, expiresAt],
  );
  return { token, csrfToken, expiresAt };
}

export async function getSession(token: string | undefined) {
  if (!token) return null;
  const result = await query<AppUser & { csrf_token: string; expires_at: Date }>(
    `SELECT u.id, u.username, u.role, u.barber_id AS "barberId", u.must_change_password AS "mustChangePassword", u.active,
            s.csrf_token, s.expires_at
       FROM app_sessions s JOIN app_users u ON u.id = s.user_id
      WHERE s.token_hash = $1 AND s.expires_at > now() AND u.active = true LIMIT 1`,
    [hashSessionToken(token)],
  );
  return result.rows[0] ?? null;
}

export async function deleteSession(token: string | undefined) {
  if (!token) return;
  await query("DELETE FROM app_sessions WHERE token_hash = $1", [hashSessionToken(token)]);
}

export async function authenticate(username: string, password: string) {
  const result = await query<{ id: string; username: string; role: "admin" | "barber"; barber_id: string | null; must_change_password: boolean; active: boolean; password_hash: string }>(
    "SELECT id, username, role, barber_id, must_change_password, active, password_hash FROM app_users WHERE username = $1 LIMIT 1",
    [username.trim().toLowerCase()],
  );
  const row = result.rows[0];
  if (!row || !row.active || !(await bcrypt.compare(password, row.password_hash))) return null;
  return {
    id: row.id,
    username: row.username,
    role: row.role,
    barberId: row.barber_id,
    mustChangePassword: row.must_change_password,
    active: row.active,
  } satisfies AppUser;
}

export async function changePassword(userId: string, password: string) {
  const hash = await bcrypt.hash(password, 12);
  await query("UPDATE app_users SET password_hash = $1, must_change_password = false, updated_at = now() WHERE id = $2", [hash, userId]);
}

export async function transaction<T>(work: (client: PoolClient) => Promise<T>) {
  return withClient(async client => {
    await client.query("BEGIN");
    try {
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
}
