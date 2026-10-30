import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { parse } from "cookie";
import { getSession, type AppUser } from "../dbPg";

export const APP_SESSION_COOKIE = "barbfin_session";
export const CSRF_COOKIE = "barbfin_csrf";

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: AppUser | null;
  csrfToken: string | null;
};

export async function createContext(opts: CreateExpressContextOptions): Promise<TrpcContext> {
  const cookies = parse(opts.req.headers.cookie ?? "");
  const session = await getSession(cookies[APP_SESSION_COOKIE]);
  return {
    req: opts.req,
    res: opts.res,
    user: session
      ? {
          id: session.id,
          username: session.username,
          role: session.role,
          barberId: session.barberId,
          mustChangePassword: session.mustChangePassword,
          active: session.active,
        }
      : null,
    csrfToken: session?.csrf_token ?? null,
  };
}
