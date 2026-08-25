-- Roles
CREATE TYPE public.app_role AS ENUM ('admin','moderator','user');
CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  role public.app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, role)
);
GRANT SELECT ON public.user_roles TO authenticated;
GRANT ALL ON public.user_roles TO service_role;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role public.app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE POLICY "Users read own roles" ON public.user_roles FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Admins read all roles" ON public.user_roles FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

-- Bot users
CREATE TABLE public.bot_users (
  id bigserial PRIMARY KEY,
  telegram_id bigint NOT NULL UNIQUE,
  username text,
  first_name text,
  wallet_balance numeric(14,2) NOT NULL DEFAULT 0,
  is_banned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_users TO authenticated;
GRANT ALL ON public.bot_users TO service_role;
ALTER TABLE public.bot_users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot users" ON public.bot_users FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_bot_users_updated BEFORE UPDATE ON public.bot_users FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Categories
CREATE TABLE public.categories (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  description text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.categories TO authenticated;
GRANT ALL ON public.categories TO service_role;
ALTER TABLE public.categories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage categories" ON public.categories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.subcategories (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  category_id bigint REFERENCES public.categories(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.subcategories TO authenticated;
GRANT ALL ON public.subcategories TO service_role;
ALTER TABLE public.subcategories ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage subcategories" ON public.subcategories FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Products
CREATE TYPE public.product_type AS ENUM ('key','file');
CREATE TABLE public.products (
  id bigserial PRIMARY KEY,
  name text NOT NULL,
  description text,
  price numeric(14,2) NOT NULL CHECK (price >= 0),
  stock_count integer NOT NULL DEFAULT 0,
  product_type public.product_type NOT NULL DEFAULT 'key',
  category_id bigint REFERENCES public.categories(id) ON DELETE SET NULL,
  subcategory_id bigint REFERENCES public.subcategories(id) ON DELETE SET NULL,
  image_url text,
  download_link text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.products TO authenticated;
GRANT ALL ON public.products TO service_role;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage products" ON public.products FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_products_updated BEFORE UPDATE ON public.products FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Orders
CREATE TYPE public.order_status AS ENUM ('processing','completed','cancelled');
CREATE TYPE public.dispute_status AS ENUM ('nil','opened','resolved');
CREATE TABLE public.orders (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  total_amount numeric(14,2) NOT NULL,
  status public.order_status NOT NULL DEFAULT 'processing',
  dispute_status public.dispute_status NOT NULL DEFAULT 'nil',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);
CREATE INDEX idx_orders_user ON public.orders(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage orders" ON public.orders FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

CREATE TABLE public.order_items (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  product_id bigint REFERENCES public.products(id) ON DELETE SET NULL,
  product_name text NOT NULL,
  quantity integer NOT NULL DEFAULT 1,
  price numeric(14,2) NOT NULL,
  delivered_asset text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_order_items_order ON public.order_items(order_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage order items" ON public.order_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Product keys inventory
CREATE TABLE public.product_keys (
  id bigserial PRIMARY KEY,
  product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  key_value text NOT NULL,
  is_sold boolean NOT NULL DEFAULT false,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sold_at timestamptz
);
CREATE INDEX idx_product_keys_product ON public.product_keys(product_id, is_sold);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_keys TO authenticated;
GRANT ALL ON public.product_keys TO service_role;
ALTER TABLE public.product_keys ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage product keys" ON public.product_keys FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Cart
CREATE TABLE public.cart_items (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  product_id bigint NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage cart items" ON public.cart_items FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Manual crypto payments / invoices
CREATE TYPE public.payment_asset AS ENUM ('BTC','USDT_TRC20','USDC_ERC20');
CREATE TYPE public.transaction_status AS ENUM ('pending','submitted','completed','expired','failed');
CREATE TABLE public.transactions (
  id bigserial PRIMARY KEY,
  invoice_code text NOT NULL UNIQUE,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  amount_usd numeric(14,2) NOT NULL CHECK (amount_usd > 0),
  asset public.payment_asset NOT NULL,
  pay_address text NOT NULL,
  expected_amount numeric(30,8) NOT NULL DEFAULT 0,
  unit_price_usd numeric(20,8) NOT NULL DEFAULT 0,
  tx_hash text,
  status public.transaction_status NOT NULL DEFAULT 'pending',
  auto_verified boolean NOT NULL DEFAULT false,
  verification_note text,
  admin_note text,
  credited_amount numeric(14,2),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  submitted_at timestamptz,
  completed_at timestamptz
);
CREATE UNIQUE INDEX idx_transactions_txhash ON public.transactions(lower(tx_hash)) WHERE tx_hash IS NOT NULL;
CREATE INDEX idx_transactions_status ON public.transactions(status);
CREATE INDEX idx_transactions_user ON public.transactions(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.transactions TO authenticated;
GRANT ALL ON public.transactions TO service_role;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage transactions" ON public.transactions FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_transactions_updated BEFORE UPDATE ON public.transactions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Wallet ledger
CREATE TABLE public.wallet_ledger (
  id bigserial PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  amount numeric(14,2) NOT NULL,
  balance_after numeric(14,2) NOT NULL,
  reason text NOT NULL,
  transaction_id bigint REFERENCES public.transactions(id) ON DELETE SET NULL,
  order_id bigint REFERENCES public.orders(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_wallet_ledger_user ON public.wallet_ledger(user_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.wallet_ledger TO authenticated;
GRANT ALL ON public.wallet_ledger TO service_role;
ALTER TABLE public.wallet_ledger ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage ledger" ON public.wallet_ledger FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Disputes
CREATE TABLE public.disputes (
  id bigserial PRIMARY KEY,
  order_id bigint NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  user_id bigint NOT NULL REFERENCES public.bot_users(id) ON DELETE CASCADE,
  reason text NOT NULL,
  status public.dispute_status NOT NULL DEFAULT 'opened',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.disputes TO authenticated;
GRANT ALL ON public.disputes TO service_role;
ALTER TABLE public.disputes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage disputes" ON public.disputes FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Broadcasts
CREATE TABLE public.broadcasts (
  id bigserial PRIMARY KEY,
  message_text text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.broadcasts TO authenticated;
GRANT ALL ON public.broadcasts TO service_role;
ALTER TABLE public.broadcasts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage broadcasts" ON public.broadcasts FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Store settings (single row)
CREATE TABLE public.store_settings (
  id integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  store_name text NOT NULL DEFAULT 'Digital Products Store',
  welcome_message text NOT NULL DEFAULT 'Welcome to our digital store!',
  support_username text,
  channel_username text,
  admin_telegram_id bigint,
  btc_address text,
  usdt_trc20_address text,
  usdc_erc20_address text,
  auto_confirm boolean NOT NULL DEFAULT true,
  payment_expiry_minutes integer NOT NULL DEFAULT 60,
  min_topup_usd numeric(14,2) NOT NULL DEFAULT 5,
  amount_tolerance_percent numeric(6,3) NOT NULL DEFAULT 2,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_settings TO authenticated;
GRANT ALL ON public.store_settings TO service_role;
ALTER TABLE public.store_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage settings" ON public.store_settings FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE TRIGGER trg_settings_updated BEFORE UPDATE ON public.store_settings FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.store_settings (id, admin_telegram_id, btc_address, usdt_trc20_address, usdc_erc20_address)
VALUES (1, 6505578903, '1EqgNKJMmnnWpGjYZJAapDEyyXruXxLCYj', 'TZADiUxhu9Y5bvJUMbMtBgFW43KqQ1hzaD', '0xfe601096668c46d4bb0bd4e3c93751a3a8f4b3e5');

-- Conversation state
CREATE TABLE public.bot_state (
  chat_id bigint PRIMARY KEY,
  state jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.bot_state TO authenticated;
GRANT ALL ON public.bot_state TO service_role;
ALTER TABLE public.bot_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage bot state" ON public.bot_state FOR ALL TO authenticated USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Telegram update dedupe
CREATE TABLE public.telegram_updates (
  update_id bigint PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.telegram_updates TO service_role;
ALTER TABLE public.telegram_updates ENABLE ROW LEVEL SECURITY;

-- Balance helper (atomic)
CREATE OR REPLACE FUNCTION public.adjust_balance(_user_id bigint, _amount numeric, _reason text, _transaction_id bigint DEFAULT NULL, _order_id bigint DEFAULT NULL)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE new_balance numeric;
BEGIN
  UPDATE public.bot_users SET wallet_balance = wallet_balance + _amount WHERE id = _user_id RETURNING wallet_balance INTO new_balance;
  IF new_balance IS NULL THEN RAISE EXCEPTION 'user not found'; END IF;
  IF new_balance < 0 THEN RAISE EXCEPTION 'insufficient balance'; END IF;
  INSERT INTO public.wallet_ledger (user_id, amount, balance_after, reason, transaction_id, order_id)
  VALUES (_user_id, _amount, new_balance, _reason, _transaction_id, _order_id);
  RETURN new_balance;
END; $$;
REVOKE ALL ON FUNCTION public.adjust_balance(bigint, numeric, text, bigint, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.adjust_balance(bigint, numeric, text, bigint, bigint) TO service_role;