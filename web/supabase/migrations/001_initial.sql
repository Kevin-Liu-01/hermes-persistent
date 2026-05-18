-- Agent-Machines: initial Supabase schema
-- Machine configs + self-collected metrics

-- ──────────────────────────────────────────────
-- Users (one row per Clerk user)
-- ──────────────────────────────────────────────

create table if not exists users (
  id text primary key,
  email text,
  display_name text,
  active_machine_id text,
  setup_step text not null default 'api-key',
  draft_agent_kind text not null default 'hermes',
  draft_provider_kind text not null default 'dedalus',
  draft_model text not null default 'anthropic/claude-sonnet-4-6',
  draft_spec jsonb not null default '{"vcpu":1,"memoryMib":2048,"storageGib":10}',
  active_loadout_preset_id text not null default 'default',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ──────────────────────────────────────────────
-- Machines (replaces Clerk MachineRef[])
-- ──────────────────────────────────────────────

create table if not exists machines (
  id text not null,
  user_id text not null references users(id) on delete cascade,
  provider_kind text not null,
  agent_kind text not null,
  name text not null,
  model text not null,
  spec jsonb not null default '{"vcpu":1,"memoryMib":2048,"storageGib":10}',
  api_url text,
  api_key text,
  agent_profile_id text,
  gateway_profile_id text,
  environment_profile_id text,
  bootstrap_preset_id text,
  bootstrap_state jsonb not null default '{"phase":"idle","current":null,"completed":[],"startedAt":null,"finishedAt":null,"lastError":null}',
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id, user_id)
);

create index if not exists idx_machines_user
  on machines (user_id) where not archived;

-- ──────────────────────────────────────────────
-- Machine metrics (raw resource samples)
-- ──────────────────────────────────────────────

create table if not exists machine_metrics (
  id bigint generated always as identity primary key,
  user_id text not null,
  machine_id text not null,
  recorded_at timestamptz not null default now(),
  cpu_percent numeric(5,2),
  memory_used_mib numeric(10,2),
  memory_total_mib numeric(10,2),
  storage_used_gib numeric(10,3),
  storage_total_gib numeric(10,3),
  load_avg_1m numeric(6,3),
  phase text not null,
  vcpu integer not null,
  spec_memory_mib integer not null
);

create index if not exists idx_metrics_lookup
  on machine_metrics (user_id, machine_id, recorded_at desc);

-- ──────────────────────────────────────────────
-- Machine transitions (state change log)
-- ──────────────────────────────────────────────

create table if not exists machine_transitions (
  id bigint generated always as identity primary key,
  user_id text not null,
  machine_id text not null,
  occurred_at timestamptz not null default now(),
  from_phase text,
  to_phase text not null,
  reason text,
  machine_name text
);

create index if not exists idx_transitions_lookup
  on machine_transitions (user_id, machine_id, occurred_at desc);

-- ──────────────────────────────────────────────
-- Machine usage daily (pre-aggregated rollups)
-- ──────────────────────────────────────────────

create table if not exists machine_usage_daily (
  id bigint generated always as identity primary key,
  user_id text not null,
  machine_id text not null,
  bucket_date date not null,
  awake_seconds integer not null default 0,
  cpu_vcpu_seconds numeric(12,2) not null default 0,
  memory_gib_seconds numeric(12,2) not null default 0,
  storage_gib_hours numeric(12,4) not null default 0,
  sample_count integer not null default 0,
  vcpu integer not null,
  spec_memory_mib integer not null,
  spec_storage_gib integer not null,
  unique (user_id, machine_id, bucket_date)
);

create index if not exists idx_usage_daily_range
  on machine_usage_daily (user_id, bucket_date desc);

-- ──────────────────────────────────────────────
-- Machine cost estimates (derived daily cost)
-- ──────────────────────────────────────────────

create table if not exists machine_cost_estimates (
  id bigint generated always as identity primary key,
  user_id text not null,
  machine_id text not null,
  bucket_date date not null,
  cpu_cost_millicents bigint not null default 0,
  memory_cost_millicents bigint not null default 0,
  storage_cost_millicents bigint not null default 0,
  total_cost_millicents bigint not null default 0,
  unique (user_id, machine_id, bucket_date)
);

create index if not exists idx_cost_range
  on machine_cost_estimates (user_id, bucket_date desc);
