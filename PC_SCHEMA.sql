-- PepeCheck tables (pc_ prefixed) — run once in the Neon SQL console.
CREATE TABLE IF NOT EXISTS pc_vaults (
  token_id         text PRIMARY KEY,
  contract         text,
  card             text,
  collection       text,
  state            text,
  contents         jsonb DEFAULT '[]',
  btc_address      text,
  recorded_project text,
  expected_project text,
  verified_at      timestamptz,
  history          jsonb DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS pc_listings (
  order_hash  text PRIMARY KEY,
  token_id    text,
  contract    text,
  card        text,
  collection  text,
  price_eth   numeric,
  currency    text,
  seller      text,
  source      text DEFAULT 'opensea',
  expires_at  timestamptz,
  active      boolean DEFAULT true,
  updated_at  timestamptz DEFAULT now()
);
CREATE TABLE IF NOT EXISTS pc_contracts (address text PRIMARY KEY, slug text);
CREATE INDEX IF NOT EXISTS pc_listings_card_idx   ON pc_listings (card) WHERE active;
CREATE INDEX IF NOT EXISTS pc_listings_active_idx ON pc_listings (active, collection);
CREATE INDEX IF NOT EXISTS pc_vaults_state_idx    ON pc_vaults (state);
