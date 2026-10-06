-- Row Level Security. Service-role calls (API routes) bypass RLS by design.

alter table public.users enable row level security;
alter table public.ambulances enable row level security;
alter table public.hospitals enable row level security;
alter table public.junctions enable row level security;
alter table public.journeys enable row level security;
alter table public.location_updates enable row level security;
alter table public.alerts enable row level security;
alter table public.road_incidents enable row level security;
alter table public.audit_log enable row level security;

-- users: read own row or any (admin). Updates only via service role (role changes).
create policy "users select own or admin" on public.users
  for select to authenticated using (id = auth.uid() or public.is_admin());

-- ambulances
create policy "ambulances select authenticated" on public.ambulances
  for select to authenticated using (true);
create policy "ambulances insert admin" on public.ambulances
  for insert to authenticated with check (public.is_admin());
create policy "ambulances update admin or assigned driver" on public.ambulances
  for update to authenticated
  using (public.is_admin() or driver_id = auth.uid())
  with check (public.is_admin() or driver_id = auth.uid());
create policy "ambulances delete admin" on public.ambulances
  for delete to authenticated using (public.is_admin());

-- hospitals / junctions: readable by all authenticated; writable by admin.
create policy "hospitals select authenticated" on public.hospitals
  for select to authenticated using (true);
create policy "hospitals insert admin" on public.hospitals
  for insert to authenticated with check (public.is_admin());
create policy "hospitals update admin" on public.hospitals
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "hospitals delete admin" on public.hospitals
  for delete to authenticated using (public.is_admin());

create policy "junctions select authenticated" on public.junctions
  for select to authenticated using (true);
create policy "junctions insert admin" on public.junctions
  for insert to authenticated with check (public.is_admin());
create policy "junctions update admin" on public.junctions
  for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "junctions delete admin" on public.junctions
  for delete to authenticated using
   (public.is_admin());

-- journeys: police/admin read all; drivers read and write only their own.
create policy "journeys select police admin or owner" on public.journeys
  for select to authenticated
  using (
    public.is_police() or public.is_admin()
    or exists (select 1 from public.ambulances a
               where a.id = journeys.ambulance_id and a.driver_id = auth.uid())
  );
create policy "journeys insert owner" on public.journeys
  for insert to authenticated
  with check (
    exists (select 1 from public.ambulances a
            where a.id = ambulance_id and a.driver_id = auth.uid())
  );
create policy "journeys update owner or admin" on public.journeys
  for update to authenticated
  using (
    public.is_admin()
    or exists (select 1 from public.ambulances a
               where a.id = journeys.ambulance_id and a.driver_id = auth.uid())
  )
  with check (
    public.is_admin()
    or exists (select 1 from public.ambulances a
               where a.id = ambulance_id and a.driver_id = auth.uid())
  );

-- location_updates: drivers append to their own journeys; police/admin read.
create policy "location_updates insert owner" on public.location_updates
  for insert to authenticated
  with check (
    exists (select 1 from public.journeys j
            join public.ambulances a on a.id = j.ambulance_id
            where j.id = journey_id and a.driver_id = auth.uid())
  );
create policy "location_updates select police admin or owner" on public.location_updates
  for select to authenticated
  using (
    public.is_police() or public.is_admin()
    or exists (select 1 from public.journeys j
               join public.ambulances a on a.id = j.ambulance_id
               where j.id = journey_id and a.driver_id = auth.uid())
  );

-- alerts: created/cleared by the DB trigger (security definer); acknowledged by police.
create policy "alerts select police admin or owner" on public.alerts
  for select to authenticated
  using (
    public.is_police() or public.is_admin()
    or exists (select 1 from public.journeys j
               join public.ambulances a on a.id = j.ambulance_id
               where j.id = journey_id and a.driver_id = auth.uid())
  );
create policy "alerts update police or admin" on public.alerts
  for update to authenticated
  using (public.is_police() or public.is_admin())
  with check (public.is_police() or public.is_admin());

-- road_incidents: any authenticated driver reports at own position; police resolve.
create policy "road_incidents select authenticated" on public.road_incidents
  for select to authenticated using (true);
create policy "road_incidents insert self" on public.road_incidents
  for insert to authenticated with check (reported_by = auth.uid());
create policy "road_incidents update police or admin" on public.road_incidents
  for update to authenticated
  using (public.is_police() or public.is_admin())
  with check (public.is_police() or public.is_admin());

-- audit_log: append-only for the acting user; readable by admins.
create policy "audit_log insert self" on public.audit_log
  for insert to authenticated with check (actor = auth.uid());
create policy "audit_log select admin" on public.audit_log
  for select to authenticated using (public.is_admin());