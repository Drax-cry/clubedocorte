CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NOT NULL,
  role text NOT NULL CHECK (role IN ('admin', 'barber')),
  barber_id uuid,
  must_change_password boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS barbers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  commission_rate numeric(5,2) NOT NULL DEFAULT 50 CHECK (commission_rate >= 0 AND commission_rate <= 100),
  product_commission_enabled boolean NOT NULL DEFAULT false,
  product_commission_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (product_commission_rate >= 0 AND product_commission_rate <= 100),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE app_users DROP CONSTRAINT IF EXISTS app_users_barber_fk;
ALTER TABLE app_users ADD CONSTRAINT app_users_barber_fk FOREIGN KEY (barber_id) REFERENCES barbers(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS services (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS products (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  price numeric(12,2) NOT NULL CHECK (price >= 0),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS services_name_unique_idx ON services (name);
CREATE UNIQUE INDEX IF NOT EXISTS products_name_unique_idx ON products (name);

CREATE TABLE IF NOT EXISTS payment_methods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expense_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS sales (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES barbers(id),
  sold_at timestamptz NOT NULL DEFAULT now(),
  payment_method_id uuid REFERENCES payment_methods(id),
  payment_method_name text NOT NULL,
  notes text,
  services_total numeric(12,2) NOT NULL DEFAULT 0,
  products_total numeric(12,2) NOT NULL DEFAULT 0,
  total numeric(12,2) NOT NULL DEFAULT 0,
  service_commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  product_commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  service_commission numeric(12,2) NOT NULL DEFAULT 0,
  product_commission numeric(12,2) NOT NULL DEFAULT 0,
  created_by uuid REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS sale_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  item_type text NOT NULL CHECK (item_type IN ('service', 'product')),
  catalog_id uuid NOT NULL,
  name_snapshot text NOT NULL,
  unit_price numeric(12,2) NOT NULL,
  quantity integer NOT NULL CHECK (quantity > 0),
  line_total numeric(12,2) NOT NULL,
  commission_rate numeric(5,2) NOT NULL DEFAULT 0,
  commission_total numeric(12,2) NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  description text NOT NULL,
  category_id uuid REFERENCES expense_categories(id),
  category_name text NOT NULL,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  expense_date timestamptz NOT NULL DEFAULT now(),
  payment_method_name text NOT NULL,
  notes text,
  created_by uuid REFERENCES app_users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS commission_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  barber_id uuid NOT NULL REFERENCES barbers(id),
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  paid_at timestamptz NOT NULL DEFAULT now(),
  payment_method_name text NOT NULL,
  notes text,
  created_by uuid REFERENCES app_users(id)
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id uuid REFERENCES app_users(id),
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  before_data jsonb,
  after_data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS annual_archives (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year integer NOT NULL UNIQUE,
  revenue numeric(12,2) NOT NULL DEFAULT 0,
  expenses numeric(12,2) NOT NULL DEFAULT 0,
  net_profit numeric(12,2) NOT NULL DEFAULT 0,
  appointments integer NOT NULL DEFAULT 0,
  backup_json jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS sales_sold_at_idx ON sales (sold_at);
CREATE INDEX IF NOT EXISTS sales_barber_idx ON sales (barber_id, sold_at);
CREATE INDEX IF NOT EXISTS sale_items_type_idx ON sale_items (item_type, catalog_id);
CREATE INDEX IF NOT EXISTS expenses_date_idx ON expenses (expense_date);
CREATE INDEX IF NOT EXISTS audit_created_idx ON audit_logs (created_at);

INSERT INTO payment_methods (name, sort_order) VALUES
  ('Dinheiro', 1), ('Cartão', 2), ('MB WAY', 3), ('Outro', 4)
ON CONFLICT (name) DO NOTHING;

INSERT INTO expense_categories (name) VALUES
  ('Renda'), ('Eletricidade'), ('Água'), ('Produtos'), ('Equipamentos'),
  ('Salários'), ('Marketing'), ('Manutenção'), ('Outros')
ON CONFLICT (name) DO NOTHING;

INSERT INTO services (name, price) VALUES
  ('Corte de cabelo', 12.00), ('Corte degradê', 15.00), ('Barba', 8.00),
  ('Sobrancelha', 5.00), ('Lavagem', 4.00)
ON CONFLICT (name) DO NOTHING;

INSERT INTO products (name, price) VALUES
  ('Pomada matte', 12.50), ('Shampoo premium', 10.00), ('Óleo para barba', 14.00),
  ('Cera modeladora', 11.50)
ON CONFLICT (name) DO NOTHING;
