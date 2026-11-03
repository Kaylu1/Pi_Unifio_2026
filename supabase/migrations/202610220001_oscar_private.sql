-- OScar: preparação local para Supabase/PostgreSQL. Não publica nem cria usuários.
-- Execute este arquivo inteiro no editor SQL somente quando houver autorização para usar o projeto.
BEGIN;
CREATE SCHEMA IF NOT EXISTS oscar_private;
REVOKE ALL ON SCHEMA oscar_private FROM PUBLIC;

CREATE TABLE IF NOT EXISTS oscar_private.clients (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS oscar_private.vehicles (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 clientid BIGINT NOT NULL REFERENCES oscar_private.clients(id)
);
CREATE TABLE IF NOT EXISTS oscar_private.users (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 clientid BIGINT REFERENCES oscar_private.clients(id),
 email TEXT NOT NULL UNIQUE CHECK (email = lower(email) AND length(email) BETWEEN 3 AND 254),
 passwordhash TEXT NOT NULL,
 CONSTRAINT users_valid_role CHECK (data->>'role' IN ('gerente','atendente','mecanico','consultor','cliente'))
);
CREATE TABLE IF NOT EXISTS oscar_private.services (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS oscar_private.suppliers (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS oscar_private.parts (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 supplierid BIGINT REFERENCES oscar_private.suppliers(id),
 CONSTRAINT parts_nonnegative_stock CHECK (
  NOT (data ? 'stock') OR (jsonb_typeof(data->'stock') = 'number' AND (data->>'stock')::numeric >= 0)
 )
);
CREATE TABLE IF NOT EXISTS oscar_private.appointments (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 clientid BIGINT NOT NULL REFERENCES oscar_private.clients(id),
 vehicleid BIGINT NOT NULL REFERENCES oscar_private.vehicles(id),
 mechanicid BIGINT NOT NULL REFERENCES oscar_private.users(id)
);
CREATE TABLE IF NOT EXISTS oscar_private.orders (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 clientid BIGINT NOT NULL REFERENCES oscar_private.clients(id),
 vehicleid BIGINT NOT NULL REFERENCES oscar_private.vehicles(id),
 mechanicid BIGINT NOT NULL REFERENCES oscar_private.users(id),
 appointmentid BIGINT REFERENCES oscar_private.appointments(id),
 originorderid BIGINT REFERENCES oscar_private.orders(id),
 CONSTRAINT orders_valid_status CHECK (
  data->>'status' IN ('aberta','inspecao','aguardando_aprovacao','execucao','concluida','encerrada','cancelada')
 )
);
CREATE TABLE IF NOT EXISTS oscar_private.budgets (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 orderid BIGINT NOT NULL REFERENCES oscar_private.orders(id)
);
CREATE TABLE IF NOT EXISTS oscar_private.movements (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 partid BIGINT NOT NULL REFERENCES oscar_private.parts(id),
 orderid BIGINT REFERENCES oscar_private.orders(id),
 supplierid BIGINT REFERENCES oscar_private.suppliers(id),
 CONSTRAINT movements_positive_quantity CHECK (
  jsonb_typeof(data->'quantity') = 'number' AND (data->>'quantity')::numeric > 0
 ),
 CONSTRAINT movements_valid_type CHECK (data->>'type' IN ('entrada','saida','estorno'))
);
CREATE TABLE IF NOT EXISTS oscar_private.tickets (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 orderid BIGINT NOT NULL REFERENCES oscar_private.orders(id),
 clientid BIGINT NOT NULL REFERENCES oscar_private.clients(id)
);
CREATE TABLE IF NOT EXISTS oscar_private.emails (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS oscar_private.audit (
 id BIGSERIAL PRIMARY KEY, data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS oscar_private.settings (
 id INTEGER PRIMARY KEY CHECK (id = 1), data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object')
);
CREATE TABLE IF NOT EXISTS oscar_private.sessions (
 token TEXT PRIMARY KEY, userid BIGINT NOT NULL REFERENCES oscar_private.users(id),
 csrf TEXT NOT NULL, lastseen BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS oscar_private.reset_tokens (
 token TEXT PRIMARY KEY, userid BIGINT NOT NULL REFERENCES oscar_private.users(id),
 expiresat BIGINT NOT NULL, used INTEGER NOT NULL DEFAULT 0 CHECK (used IN (0,1))
);
CREATE TABLE IF NOT EXISTS oscar_private.rate_limits (
 keyhash TEXT PRIMARY KEY, count INTEGER NOT NULL CHECK (count > 0), expiresat BIGINT NOT NULL
);
CREATE TABLE IF NOT EXISTS oscar_private.backups (
 id BIGSERIAL PRIMARY KEY, day DATE NOT NULL UNIQUE,
 data JSONB NOT NULL CHECK (jsonb_typeof(data) = 'object'),
 createdat TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS oscar_private.privacy_tombstones (
 clientid BIGINT PRIMARY KEY, erasedat TIMESTAMPTZ NOT NULL DEFAULT now(),
 actorid BIGINT, reason TEXT NOT NULL DEFAULT 'Solicitação do titular'
);

CREATE INDEX IF NOT EXISTS idx_appointments_mechanic ON oscar_private.appointments(mechanicid);
CREATE INDEX IF NOT EXISTS idx_orders_client ON oscar_private.orders(clientid);
CREATE INDEX IF NOT EXISTS idx_orders_mechanic ON oscar_private.orders(mechanicid);
CREATE INDEX IF NOT EXISTS idx_movements_part ON oscar_private.movements(partid);
CREATE INDEX IF NOT EXISTS idx_budgets_order ON oscar_private.budgets(orderid);
CREATE INDEX IF NOT EXISTS idx_vehicles_client ON oscar_private.vehicles(clientid);
CREATE INDEX IF NOT EXISTS idx_tickets_client ON oscar_private.tickets(clientid);
CREATE INDEX IF NOT EXISTS idx_sessions_expiration ON oscar_private.sessions(lastseen);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON oscar_private.sessions(userid);
CREATE INDEX IF NOT EXISTS idx_reset_expiration ON oscar_private.reset_tokens(expiresat);
CREATE INDEX IF NOT EXISTS idx_reset_user ON oscar_private.reset_tokens(userid);
CREATE INDEX IF NOT EXISTS idx_rate_expiration ON oscar_private.rate_limits(expiresat);
CREATE UNIQUE INDEX IF NOT EXISTS clients_active_cpf_unique
 ON oscar_private.clients ((NULLIF(regexp_replace(data->>'cpf', '[^0-9]', '', 'g'), '')))
 WHERE COALESCE((data->>'active')::boolean, true);
CREATE UNIQUE INDEX IF NOT EXISTS clients_active_email_unique
 ON oscar_private.clients ((NULLIF(lower(data->>'email'), '')))
 WHERE COALESCE((data->>'active')::boolean, true);
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_active_plate_unique
 ON oscar_private.vehicles ((NULLIF(upper(regexp_replace(data->>'plate', '[^A-Za-z0-9]', '', 'g')), '')))
 WHERE COALESCE((data->>'active')::boolean, true);
CREATE UNIQUE INDEX IF NOT EXISTS parts_code_unique ON oscar_private.parts ((upper(data->>'code')));

-- A API acessa por conexão SQL privada. Nenhuma política pública é criada.
DO $oscar_permissions$
DECLARE table_name TEXT; role_name TEXT;
BEGIN
 FOR table_name IN SELECT tablename FROM pg_tables WHERE schemaname='oscar_private'
 LOOP
  EXECUTE format('ALTER TABLE oscar_private.%I ENABLE ROW LEVEL SECURITY', table_name);
  EXECUTE format('REVOKE ALL ON TABLE oscar_private.%I FROM PUBLIC', table_name);
 END LOOP;
 REVOKE ALL ON ALL SEQUENCES IN SCHEMA oscar_private FROM PUBLIC;
 FOR role_name IN SELECT rolname FROM pg_roles WHERE rolname IN ('anon','authenticated')
 LOOP
  EXECUTE format('REVOKE ALL ON SCHEMA oscar_private FROM %I', role_name);
  EXECUTE format('REVOKE ALL ON ALL TABLES IN SCHEMA oscar_private FROM %I', role_name);
  EXECUTE format('REVOKE ALL ON ALL SEQUENCES IN SCHEMA oscar_private FROM %I', role_name);
 END LOOP;
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='service_role') THEN
  GRANT USAGE ON SCHEMA oscar_private TO service_role;
  GRANT ALL ON ALL TABLES IN SCHEMA oscar_private TO service_role;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA oscar_private TO service_role;
 END IF;
END
$oscar_permissions$;
ALTER DEFAULT PRIVILEGES IN SCHEMA oscar_private REVOKE ALL ON TABLES FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA oscar_private REVOKE ALL ON SEQUENCES FROM PUBLIC;

INSERT INTO oscar_private.settings(id,data) VALUES (1, '{
 "workshopName":"OScar Oficina","approvalMethods":["presencial","telefone","mensagem"],
 "warrantyDays":90,"consumptionWindowDays":30,"defaultLeadDays":5,"budgetValidityHours":48,
 "openingHour":8,"closingHour":18,"appointmentIntervalMinutes":30
}'::jsonb) ON CONFLICT (id) DO NOTHING;
COMMIT;
