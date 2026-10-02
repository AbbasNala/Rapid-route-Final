-- RapidRoute — demo schema (hackathon prototype)
-- WARNING: RLS policies below are intentionally permissive for the anon demo role.
-- For production, restrict to `authenticated` and write via the service role on the server.

create extension if not exists "pgcrypto";

create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text not null check (role in ('ambulance_driver','traffic_police')),
  created_at timestamptz not null default now()
);

create table if not exists public.hospitals (
  id text primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  address text
);

create table if not exists public.junctions (
  id text primary key,
  name text not null,
  latitude double precision not null,
  longitude double precision not null,
  radius integer not null default 500,
  status text not null default 'monitoring' check (status in ('monitoring','preparing','cleared')),
  traffic text not null default 'medium' check (traffic in ('low','medium','high')),
  officer text,
  officer_phone text
);

create table if not exists public.ambulances (
  id text primary key,
  ambulance_number text not null unique,
  driver_name text not null,
  status text not null default 'available' check (status in ('available','enroute','offline')),
  current_latitude double precision not null,
  current_longitude double precision not null,
  destination_hospital_id text references public.hospitals(id),
  active_route_id text
);

create table if not exists public.journeys (
  id text primary key,
  ambulance_id text not null references public.ambulances(id),
  destination_hospital_id text not null references public.hospitals(id),
  route_geometry jsonb,                                   -- GeoJSON LineString
  route_source text not null default 'demo' check (route_source in ('ors','demo')),
  route_length_m double precision not null default 0,
  traveled_m double precision not null default 0,
  milestones jsonb not null default '[]'::jsonb,
  driver_name text,
  ambulance_number text,
  status text not null default 'active' check (status in ('active','completed','cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.location_updates (
  id uuid primary key default gen_random_uuid(),
  journey_id text not null references public.journeys(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  "timestamp" timestamptz not null default now()
);
create index if not exists location_updates_journey_idx on public.location_updates (journey_id, "timestamp" desc);

create table if not exists public.alerts (
  id text primary key,
  journey_id text not null references public.journeys(id) on delete cascade,
  ambulance_id text not null,
  junction_id text not null references public.junctions(id),
  alert_type text not null default 'approach',
  eta_seconds integer,
  status text not null default 'pending' check (status in ('pending','acknowledged','cleared')),
  officer text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  cleared_at timestamptz
);

-- ---- demo RLS: permissive on purpose (see warning at top) ----
do $$ declare t text;
begin
  foreach t in array array['users','hospitals','junctions','ambulances','journeys','location_updates','alerts']
  loop
    execute format('alter table public.%I enable row level security', t);
    execute format('create policy demo_select on public.%I for select using (true)', t);
    execute format('create policy demo_insert on public.%I for insert with check (true)', t);
    execute format('create policy demo_update on public.%I for update using (true) with check (true)', t);
    execute format('create policy demo_delete on public.%I for delete using (true)', t);
  end loop;
exception when duplicate_object then null;
end $$;

-- Realtime: enable change streaming for the synced tables
do $$ declare t text;
begin
  foreach t in array array['ambulances','junctions','journeys','alerts']
  loop
    execute format('alter publication supabase_realtime add table public.%I', t);
  end loop;
exception when others then null;
end $$;