-- Optional Supabase tables for logging diagnosis sessions.
-- Run in the Supabase SQL editor. Only the backend (service role key) writes to these tables.

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  vehicle_make text,
  vehicle_model text,
  vehicle_year int,
  status text default 'open',
  created_at timestamptz default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  role text not null,
  text text not null,
  created_at timestamptz default now()
);

create table if not exists detections (
  id uuid primary key default gen_random_uuid(),
  message_id uuid references messages(id) on delete cascade,
  cue_key text not null,
  is_red_flag boolean default false,
  weight real,
  created_at timestamptz default now()
);

create table if not exists diagnoses (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references sessions(id) on delete cascade,
  message_id uuid references messages(id) on delete set null,
  risk_band text,
  drivable boolean,
  score_numeric real,
  likely_issue text,
  rationale text,
  created_at timestamptz default now()
);

-- Row level security on, with no policies: the browser can't read or write these tables,
-- only the backend's service role key can.
alter table sessions   enable row level security;
alter table messages   enable row level security;
alter table detections enable row level security;
alter table diagnoses  enable row level security;
