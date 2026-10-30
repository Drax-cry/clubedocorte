import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { parse } from "cookie";
import { APP_SESSION_COOKIE, CSRF_COOKIE } from "./_core/context";
import { adminProcedure, adminReadProcedure, protectedProcedure, publicProcedure, router, secureProcedure } from "./_core/trpc";
import { authenticate, changePassword, createSession, deleteSession, query, transaction } from "./dbPg";

const loginAttempts = new Map<string, { count: number; resetAt: number }>();
const saleItem = z.object({ id: z.string().uuid(), quantity: z.number().int().min(1).max(99) });
const period = z.object({ start: z.string().datetime(), end: z.string().datetime() });

function getSessionToken(ctx: { req: { headers: { cookie?: string } } }) {
  return parse(ctx.req.headers.cookie ?? "")[APP_SESSION_COOKIE];
}

function toMoney(value: unknown) {
  return Number(value ?? 0);
}

function assertLoginRateLimit(key: string) {
  const now = Date.now();
  const current = loginAttempts.get(key);
  if (current && current.resetAt > now && current.count >= 8) {
    throw new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Demasiadas tentativas. Tente novamente dentro de alguns minutos." });
  }
  if (!current || current.resetAt <= now) loginAttempts.set(key, { count: 1, resetAt: now + 10 * 60_000 });
  else current.count += 1;
}

function clearLoginRateLimit(key: string) {
  loginAttempts.delete(key);
}

export const appRouter = router({
  system: router({
    health: publicProcedure.query(() => ({ status: "ok" as const })),
  }),

  auth: router({
    me: publicProcedure.query(({ ctx }) => ({ user: ctx.user, csrfToken: ctx.csrfToken })),
    login: publicProcedure
      .input(z.object({ username: z.string().min(3).max(80), password: z.string().min(1).max(200) }))
      .mutation(async ({ ctx, input }) => {
        const ip = String(ctx.req.headers["x-forwarded-for"] ?? ctx.req.socket.remoteAddress ?? "unknown");
        const key = `${ip}:${input.username.trim().toLowerCase()}`;
        assertLoginRateLimit(key);
        const user = await authenticate(input.username, input.password);
        if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Utilizador ou palavra-passe inválidos" });
        clearLoginRateLimit(key);
        const session = await createSession(user.id);
        ctx.res.cookie(APP_SESSION_COOKIE, session.token, { httpOnly: true, secure: true, sameSite: "none", path: "/", maxAge: 1000 * 60 * 60 * 24 * 14 });
        ctx.res.cookie(CSRF_COOKIE, session.csrfToken, { httpOnly: false, secure: true, sameSite: "none", path: "/", maxAge: 1000 * 60 * 60 * 24 * 14 });
        return { user, csrfToken: session.csrfToken };
      }),
    logout: secureProcedure.mutation(async ({ ctx }) => {
      await deleteSession(getSessionToken(ctx));
      ctx.res.clearCookie(APP_SESSION_COOKIE, { httpOnly: true, secure: true, sameSite: "none", path: "/" });
      ctx.res.clearCookie(CSRF_COOKIE, { httpOnly: false, secure: true, sameSite: "none", path: "/" });
      return { success: true };
    }),
    changePassword: secureProcedure
      .input(z.object({ password: z.string().min(10).max(200) }))
      .mutation(async ({ ctx, input }) => {
        await changePassword(ctx.user.id, input.password);
        return { success: true };
      }),
  }),

  catalog: router({
    list: publicProcedure.query(async () => {
      const [barbers, services, products, paymentMethods] = await Promise.all([
        query("SELECT id, name, commission_rate AS \"commissionRate\", product_commission_enabled AS \"productCommissionEnabled\", product_commission_rate AS \"productCommissionRate\", active FROM barbers WHERE active = true ORDER BY name"),
        query("SELECT id, name, price::float AS price, active FROM services WHERE active = true ORDER BY name"),
        query("SELECT id, name, price::float AS price, active FROM products WHERE active = true ORDER BY name"),
        query("SELECT id, name FROM payment_methods WHERE active = true ORDER BY sort_order, name"),
      ]);
      return { barbers: barbers.rows, services: services.rows, products: products.rows, paymentMethods: paymentMethods.rows };
    }),
  }),

  sales: router({
    create: publicProcedure
      .input(z.object({
        barberId: z.string().uuid(),
        services: z.array(saleItem).max(30),
        products: z.array(saleItem).max(30),
        paymentMethod: z.string().min(1).max(80),
        notes: z.string().max(1000).optional(),
      }).refine(value => value.services.length > 0 || value.products.length > 0, "Adicione pelo menos um serviço ou produto"))
      .mutation(async ({ ctx, input }) => {
        if (ctx.user?.role === "barber" && ctx.user.barberId !== input.barberId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "Só pode registar atendimentos do seu barbeiro" });
        }
        return transaction(async client => {
          const barberResult = await client.query<{ id: string; commission_rate: string; product_commission_enabled: boolean; product_commission_rate: string }>("SELECT id, commission_rate, product_commission_enabled, product_commission_rate FROM barbers WHERE id = $1 AND active = true", [input.barberId]);
          const barber = barberResult.rows[0];
          if (!barber) throw new TRPCError({ code: "BAD_REQUEST", message: "Barbeiro inválido" });
          const ids = [...input.services.map(item => item.id), ...input.products.map(item => item.id)];
          const catalogResult = await client.query<{ id: string; name: string; price: string; kind: "service" | "product" }>(
            `SELECT id, name, price::text, 'service'::text AS kind FROM services WHERE id = ANY($1::uuid[]) AND active = true
             UNION ALL
             SELECT id, name, price::text, 'product'::text AS kind FROM products WHERE id = ANY($1::uuid[]) AND active = true`, [ids]);
          const catalog = new Map(catalogResult.rows.map(row => [row.id, row]));
          const serviceRows = input.services.map(item => ({ item, data: catalog.get(item.id) })).filter(row => row.data?.kind === "service");
          const productRows = input.products.map(item => ({ item, data: catalog.get(item.id) })).filter(row => row.data?.kind === "product");
          if (serviceRows.length !== input.services.length || productRows.length !== input.products.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Um serviço ou produto já não está disponível" });
          const servicesTotal = serviceRows.reduce((sum, row) => sum + Number(row.data!.price) * row.item.quantity, 0);
          const productsTotal = productRows.reduce((sum, row) => sum + Number(row.data!.price) * row.item.quantity, 0);
          const serviceRate = Number(barber.commission_rate);
          const productRate = barber.product_commission_enabled ? Number(barber.product_commission_rate) : 0;
          const serviceCommission = servicesTotal * serviceRate / 100;
          const productCommission = productsTotal * productRate / 100;
          const saleResult = await client.query<{ id: string }>(
            `INSERT INTO sales (barber_id, payment_method_name, notes, services_total, products_total, total, service_commission_rate, product_commission_rate, service_commission, product_commission, created_by)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
            [input.barberId, input.paymentMethod, input.notes ?? null, servicesTotal, productsTotal, servicesTotal + productsTotal, serviceRate, productRate, serviceCommission, productCommission, ctx.user?.id ?? null]);
          const saleId = saleResult.rows[0].id;
          for (const row of serviceRows) {
            const total = Number(row.data!.price) * row.item.quantity;
            await client.query(`INSERT INTO sale_items (sale_id, item_type, catalog_id, name_snapshot, unit_price, quantity, line_total, commission_rate, commission_total) VALUES ($1,'service',$2,$3,$4,$5,$6,$7,$8)`, [saleId, row.data!.id, row.data!.name, row.data!.price, row.item.quantity, total, serviceRate, total * serviceRate / 100]);
          }
          for (const row of productRows) {
            const total = Number(row.data!.price) * row.item.quantity;
            await client.query(`INSERT INTO sale_items (sale_id, item_type, catalog_id, name_snapshot, unit_price, quantity, line_total, commission_rate, commission_total) VALUES ($1,'product',$2,$3,$4,$5,$6,$7,$8)`, [saleId, row.data!.id, row.data!.name, row.data!.price, row.item.quantity, total, productRate, total * productRate / 100]);
          }
          await client.query(`INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data) VALUES ($1,'create','sale',$2,$3::jsonb)`, [ctx.user?.id ?? null, saleId, JSON.stringify({ barberId: input.barberId, total: servicesTotal + productsTotal })]);
          return { id: saleId, total: servicesTotal + productsTotal };
        });
      }),
    recent: adminReadProcedure
      .input(z.object({ limit: z.number().int().min(1).max(100).default(12) }).optional())
      .query(async ({ input }) => {
        const result = await query(`SELECT s.id, s.sold_at AS \"soldAt\", b.name AS \"barberName\", s.payment_method_name AS \"paymentMethod\", s.total::float AS total FROM sales s JOIN barbers b ON b.id = s.barber_id ORDER BY s.sold_at DESC LIMIT $1`, [input?.limit ?? 12]);
        return result.rows;
      }),
  }),

  dashboard: router({
    summary: adminReadProcedure.input(period).query(async ({ input }) => {
      const [sales, expenses, details, commissions] = await Promise.all([
        query<{ revenue: string; appointments: string; services: string; products: string }>(`SELECT COALESCE(SUM(total),0)::text revenue, COUNT(*)::text appointments, COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sale_items si WHERE si.sale_id=s.id AND si.item_type='service')),0)::text services, COALESCE(SUM((SELECT COALESCE(SUM(quantity),0) FROM sale_items si WHERE si.sale_id=s.id AND si.item_type='product')),0)::text products FROM sales s WHERE sold_at >= $1 AND sold_at < $2`, [input.start, input.end]),
        query<{ expenses: string }>("SELECT COALESCE(SUM(amount),0)::text expenses FROM expenses WHERE expense_date >= $1 AND expense_date < $2", [input.start, input.end]),
        query<{ name: string; total: number }>(`SELECT si.name_snapshot AS name, SUM(si.line_total)::float AS total FROM sale_items si JOIN sales s ON s.id=si.sale_id WHERE s.sold_at >= $1 AND s.sold_at < $2 GROUP BY si.name_snapshot ORDER BY total DESC LIMIT 6`, [input.start, input.end]),
        query<{ commissions: string }>("SELECT COALESCE(SUM(service_commission + product_commission),0)::text commissions FROM sales WHERE sold_at >= $1 AND sold_at < $2", [input.start, input.end]),
      ]);
      const row = sales.rows[0] ?? { revenue: "0", appointments: "0", services: "0", products: "0" };
      const revenue = toMoney(row.revenue);
      const expenseTotal = toMoney(expenses.rows[0]?.expenses);
      return {
        revenue,
        expenses: expenseTotal,
        profit: revenue - expenseTotal,
        appointments: Number(row.appointments),
        services: Number(row.services),
        products: Number(row.products),
        commissions: toMoney(commissions.rows[0]?.commissions),
        bestSellers: details.rows,
      };
    }),
    trend: adminReadProcedure.input(period).query(async ({ input }) => {
      const result = await query<{ day: string; revenue: number; expenses: number }>(`SELECT to_char(d.day, 'DD/MM') AS day, COALESCE((SELECT SUM(total) FROM sales WHERE sold_at >= d.day AND sold_at < d.day + interval '1 day'),0)::float AS revenue, COALESCE((SELECT SUM(amount) FROM expenses WHERE expense_date >= d.day AND expense_date < d.day + interval '1 day'),0)::float AS expenses FROM generate_series($1::date, ($2::date - interval '1 day')::date, interval '1 day') d(day) ORDER BY d.day`, [input.start, input.end]);
      return result.rows;
    }),
  }),

  expenses: router({
    list: adminReadProcedure.input(z.object({ start: z.string().datetime(), end: z.string().datetime(), category: z.string().optional() })).query(async ({ input }) => {
      const result = await query(`SELECT id, description, category_name AS \"categoryName\", amount::float AS amount, expense_date AS \"expenseDate\", payment_method_name AS \"paymentMethod\", notes FROM expenses WHERE expense_date >= $1 AND expense_date < $2 AND ($3::text IS NULL OR category_name = $3) ORDER BY expense_date DESC`, [input.start, input.end, input.category ?? null]);
      return result.rows;
    }),
    create: adminProcedure.input(z.object({ description: z.string().min(2).max(160), category: z.string().min(1).max(80), amount: z.number().positive().max(1000000), date: z.string().datetime(), paymentMethod: z.string().min(1).max(80), notes: z.string().max(1000).optional() })).mutation(async ({ ctx, input }) => {
      const result = await query<{ id: string }>("INSERT INTO expenses (description, category_name, amount, expense_date, payment_method_name, notes, created_by) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id", [input.description, input.category, input.amount, input.date, input.paymentMethod, input.notes ?? null, ctx.user.id]);
      await query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data) VALUES ($1,'create','expense',$2,$3::jsonb)", [ctx.user.id, result.rows[0].id, JSON.stringify(input)]);
      return { id: result.rows[0].id };
    }),
  }),

  movements: router({
    list: adminReadProcedure.input(period).query(async ({ input }) => {
      const result = await query(`
        SELECT id, 'entrada' AS type, sold_at AS "occurredAt", payment_method_name AS "paymentMethod",
          total::float AS amount, 'Atendimento' AS description, barber_name AS "barberName"
        FROM (SELECT s.*, b.name AS barber_name FROM sales s JOIN barbers b ON b.id=s.barber_id) sales_view
        WHERE sold_at >= $1 AND sold_at < $2
        UNION ALL
        SELECT id, 'saída' AS type, expense_date AS "occurredAt", payment_method_name AS "paymentMethod",
          amount::float AS amount, description, NULL AS "barberName"
        FROM expenses WHERE expense_date >= $1 AND expense_date < $2
        ORDER BY "occurredAt" DESC
      `, [input.start, input.end]);
      return result.rows;
    }),
  }),

  admin: router({
    barbers: adminReadProcedure.query(async () => {
      const result = await query(`SELECT b.id, b.name, b.commission_rate AS \"commissionRate\", b.product_commission_enabled AS \"productCommissionEnabled\", b.product_commission_rate AS \"productCommissionRate\", b.active, COALESCE(SUM(s.total),0)::float AS revenue, COUNT(s.id)::int AS appointments FROM barbers b LEFT JOIN sales s ON s.barber_id=b.id GROUP BY b.id ORDER BY b.name`);
      return result.rows;
    }),
    updateBarber: adminProcedure.input(z.object({ id: z.string().uuid(), name: z.string().min(2).max(100), commissionRate: z.number().min(0).max(100), productCommissionEnabled: z.boolean(), productCommissionRate: z.number().min(0).max(100), active: z.boolean() })).mutation(async ({ ctx, input }) => {
      await query("UPDATE barbers SET name=$1, commission_rate=$2, product_commission_enabled=$3, product_commission_rate=$4, active=$5, updated_at=now() WHERE id=$6", [input.name, input.commissionRate, input.productCommissionEnabled, input.productCommissionRate, input.active, input.id]);
      await query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data) VALUES ($1,'update','barber',$2,$3::jsonb)", [ctx.user.id, input.id, JSON.stringify(input)]);
      return { success: true };
    }),
    categories: adminReadProcedure.query(async () => {
      const result = await query("SELECT id, name FROM expense_categories WHERE active=true ORDER BY name");
      return result.rows;
    }),
    updateService: adminProcedure.input(z.object({ id: z.string().uuid(), name: z.string().min(2).max(120), price: z.number().positive().max(100000) })).mutation(async ({ ctx, input }) => {
      await query("UPDATE services SET name=$1, price=$2, updated_at=now() WHERE id=$3", [input.name, input.price, input.id]);
      await query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data) VALUES ($1,'update','service',$2,$3::jsonb)", [ctx.user.id, input.id, JSON.stringify(input)]);
      return { success: true };
    }),
    updateProduct: adminProcedure.input(z.object({ id: z.string().uuid(), name: z.string().min(2).max(120), price: z.number().positive().max(100000) })).mutation(async ({ ctx, input }) => {
      await query("UPDATE products SET name=$1, price=$2, updated_at=now() WHERE id=$3", [input.name, input.price, input.id]);
      await query("INSERT INTO audit_logs (actor_id, action, entity_type, entity_id, after_data) VALUES ($1,'update','product',$2,$3::jsonb)", [ctx.user.id, input.id, JSON.stringify(input)]);
      return { success: true };
    }),
  }),
});

export type AppRouter = typeof appRouter;
