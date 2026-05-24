-- 001_initial.sql — MinFlow cloud sync schema (Phase 1)
--
-- Four tables + indexes for the cloud sync layer:
--   users          mirror of Clerk identity, plus subscription plan
--   workspaces     per-user workspace data as jsonb + per-field LWW timestamps
--   subscriptions  mirror of Stripe subscription state
--   sync_events    append-only delta log (30-day retention via cron)
--
-- Idempotent: uses CREATE TABLE IF NOT EXISTS + IF NOT EXISTS on indexes.

CREATE TABLE IF NOT EXISTS users (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clerk_id           text NOT NULL UNIQUE,
  email              text NOT NULL UNIQUE,
  stripe_customer_id text UNIQUE,
  plan               text NOT NULL DEFAULT 'free',
  created_at         timestamptz NOT NULL DEFAULT now(),
  deleted_at         timestamptz
);

CREATE TABLE IF NOT EXISTS workspaces (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  data             jsonb NOT NULL,
  field_timestamps jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_synced      timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_sub_id       text NOT NULL UNIQUE,
  status              text NOT NULL,
  current_period_end  timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS sync_events (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id  uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  change        jsonb NOT NULL,
  client_id     text NOT NULL,
  timestamp     timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS workspaces_user_id_idx     ON workspaces(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx  ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS sync_events_workspace_ts_idx
  ON sync_events(workspace_id, timestamp DESC);
