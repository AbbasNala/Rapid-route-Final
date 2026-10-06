-- RapidRate schema: tables, functions, triggers, realtime publication.
-- Apply with `supabase db push` or by running the file in the SQL editor.

create table if not exists public.users (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  email text not null,
  role text not null default 'ambulance_driver'
    check (role in ('ambulance_driver','traffic_police','admin')),
  created_at timestamptz not null default now()
);

create table if not exists public.ambulances (
  id uuid primary key default gen_random_uuid(),
  vehicle_number text not null unique,
  driver_id uuid references public.users(id) on delete set null,
  status text not null default 'AVAILABLE'
    check (status in ('AVAILABLE','ON_EMERGENCY','MAINTENANCE')),
  created_at timestamptz not null default now()
);

create table if not exists public.hospitals (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text not null default '',
  phone text not null default '',
  emergency_capability text,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  created_at timestamptz not null default now()
);

create table if not exists public.junctions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  geofence_radius integer not null default 500 check (geofence_radius between 50 and 5000),
  created_at timestamptz not null default now()
);

create table if not exists public.journeys (
  id uuid primary key default gen_random_uuid(),
  ambulance_id uuid not null references public.ambulances(id) on delete cascade,
  destination_hospital_id uuid not null references public.hospitals(id) on delete restrict,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','COMPLETED','CANCELLED')),
  route_geometry jsonb,                -- GeoJSON LineString, coordinates [lng, lat]
  distance double precision,           -- metres
  estimated_duration double precision, -- seconds
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists journeys_status_idx on public.journeys (status, created_at desc);

create table if not exists public.location_updates (
  id bigint generated always as identity primary key,
  journey_id uuid not null references public.journeys(id) on delete cascade,
  latitude double precision not null,
  longitude double precision not null,
  speed double precision,
  heading double precision,
  accuracy double precision,
  timestamp timestamptz not null default now()
);
create index if not exists location_updates_journey_idx
  on public.location_updates (journey_id, timestamp desc);

create table if not exists public.alerts (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.journeys(id) on delete cascade,
  ambulance_id uuid not null references public.ambulances(id) on delete cascade,
  junction_id uuid not null references public.junctions(id) on delete restrict,
  alert_type text not null default 'JUNCTION_APPROACH',
  status text not null default 'PENDING' check (status in ('PENDING','ACKNOWLEDGED','CLEARED')),
  eta_seconds double precision,
  distance_m double precision,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz,
  cleared_at timestamptz,
  acknowledged_by uuid references public.users(id)
);
-- At most one active alert per (journey, junction): duplicates are impossible.
create unique index if not exists alerts_one_active_per_junction
  on public.alerts (journey_id, junction_id) where status in ('PENDING','ACKNOWLEDGED');
create index if not exists alerts_status_idx on public.alerts (status, created_at desc);

create table if not exists public.road_incidents (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid references public.journeys(id) on delete set null,
  reported_by uuid not null references public.users(id),
  type text not null check (type in ('ACCIDENT','ROAD_BLOCKED','HEAVY_TRAFFIC','CONSTRUCTION','OTHER')),
  description text not null default '',
  latitude double precision not null,
  longitude double precision not null,
  status text not null default 'ACTIVE' check (status in ('ACTIVE','RESOLVED')),
  created_at timestamptz not null default now()
);
create index if not exists road_incidents_status_idx on public.road_incidents (status, created_at desc);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor uuid not null,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists audit_log_created_idx on public.audit_log (created_at desc);

-- ── Functions ─────────────────────────────────────────────────────────────

create or replace function public.haversine_m(
  lat1 double precision, lon1 double precision,
  lat2 double precision, lon2 double precision
) returns double precision language sql immutable as $$   select 2 * 6371000.0 * asin(least(1.0, sqrt(
    power(sin(radians(lat2 - lat1) / 2.0), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) *
    power(sin(radians(lon2 - lon1) / 2.0), 2)
  )));
 $$;

-- Role helpers (security definer avoids RLS recursion on public.users).
create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public as $$   select exists (select 1 from public.users where id = auth.uid() and role = 'admin');
 $$;
create or replace function public.is_police() returns boolean
language sql stable security definer set search_path = public as $$   select exists (select 1 from public.users where id = auth.uid() and role = 'traffic_police');
 $$;

-- Profile creation on signup. Role is FIXED to ambulance_driver here:
-- clients can never self-assign police/admin. Elevation happens only through
-- server-side service-role paths (/api/auth/bootstrap-admin, /api/admin/users).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$ begin
  insert into public.users (id, name, email, role)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'name'), ''), split_part(new.email, '@', 1)),
    new.email,
    'ambulance_driver'
  ) on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- BACKEND GEOFENCING: on every location update, evaluate every junction.
-- Inside radius + no active alert → CREATE (ETA from distance/speed).
-- Inside radius + active alert  → UPDATE ETA only (no duplicates).
-- Beyond 1.25× radius + active  → CLEAR (hysteresis prevents GPS-jitter flapping).
create or replace function public.process_location_update() returns trigger
language plpgsql security definer set search_path = public as $$ declare
  j record;
  a record;
  amb_id uuid;
  dist_m double precision;
  eta_s double precision;
begin
  select ambulance_id into amb_id from public.journeys
    where id = new.journey_id and status = 'ACTIVE';
  if amb_id is null then return new; end if;

  for j in select id, latitude, longitude, geofence_radius from public.junctions loop
    dist_m := public.haversine_m(new.latitude, new.longitude, j.latitude, j.longitude);
    if dist_m > j.geofence_radius * 3 then continue; end if;

    select * into a from public.alerts
      where journey_id = new.journey_id and junction_id = j.id
      order by created_at desc limit 1;

    if dist_m <= j.geofence_radius then
      eta_s := dist_m / greatest(coalesce(new.speed, 0), 8.0);
      if a is null or a.status = 'CLEARED' then
        insert into public.alerts (journey_id, ambulance_id, junction_id, alert_type, status, eta_seconds, distance_m)
        values (new.journey_id, amb_id, j.id, 'JUNCTION_APPROACH', 'PENDING', eta_s, dist_m);
      else
        update public.alerts set eta_seconds = eta_s, distance_m = dist_m where id = a.id;
      end if;
    elsif a is not null and a.status in ('PENDING','ACKNOWLEDGED')
          and dist_m > j.geofence_radius * 1.25 then
      update public.alerts set status = 'CLEARED', cleared_at = now() where id = a.id;
    end if;
  end loop;
  return new;
end $$;

drop trigger if exists on_location_update_insert on public.location_updates;
create trigger on_location_update_insert
after insert on public.location_updates
for each row execute function public.process_location_update();

-- Journey lifecycle: ambulance status + auto-clearing alerts on completion.
create or replace function public.handle_journey_lifecycle() returns trigger
language plpgsql security definer set search_path = public as $$ declare was_active boolean := false;
begin
  if tg_op = 'UPDATE' then was_active := (old.status = 'ACTIVE'); end if;
  if new.status = 'ACTIVE' and not was_active then
    update public.ambulances set status = 'ON_EMERGENCY' where id = new.ambulance_id;
  elsif new.status <> 'ACTIVE' and was_active then
    update public.ambulances set status = 'AVAILABLE' where id = new.ambulance_id;
    update public.alerts set status = 'CLEARED', cleared_at = now()
      where journey_id = new.id and status in ('PENDING','ACKNOWLEDGED');
  end if;
  return new;
end $$;

drop trigger if exists on_journey_lifecycle on public.journeys;
create trigger on_journey_lifecycle
after insert or update on public.journeys
for each row execute function public.handle_journey_lifecycle();

-- ── Realtime publication ──────────────────────────────────────────────────
-- replica identity full is required so RLS-authorized Realtime delivers row data.
do $$ begin
  alter table public.location_updates replica identity full;
  alter table public.alerts replica identity full;
  alter table public.journeys replica identity full;
  alter table public.road_incidents replica identity full;
exception when others then null; end $$;

do $$ declare t text;
begin
  foreach t in array array['location_updates','alerts','journeys','road_incidents'] loop
    begin
      alter publication supabase_realtime add table format('public.%I', t);
    exception when duplicate_object then null; when others then null; end;
  end loop;
end $$;