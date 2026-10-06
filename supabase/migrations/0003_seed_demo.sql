-- OPTIONAL demo data (Colombo area, approximate coordinates) for local testing.
-- Skip or delete this migration for a clean production deployment; manage real
-- records through the /admin dashboard instead.

insert into public.hospitals (name, address, phone, emergency_capability, latitude, longitude)
select * from (values
  ('National Hospital of Sri Lanka', 'Regency Road, Colombo 01000', '+94 11 269 1111', 'Trauma | Cardiac | Neuro (demo)', 6.9169, 79.8636),
  ('Asiri Central Hospital', '181 Norris Canal Road, Colombo 01000', '+94 11 452 4444', 'General emergency (demo)', 6.9215, 79.8630),
  ('Lanka Hospitals', '578 Elvitigala Mawatha, Colombo 00500', '+94 11 553 1111', 'Cardiac | ICU (demo)', 6.9019, 79.8640),
  ('Durdans Hospital', '3 Alfred Place, Colombo 00300', '+94 11 552 2141', 'General emergency (demo)', 6.9142, 79.8505)
) as h(name, address, phone, emergency_capability, latitude, longitude)
where not exists (select 1 from public.hospitals);

insert into public.junctions (name, latitude, longitude, geofence_radius)
select * from (values
  ('Borella Junction', 6.9147, 79.8776, 500),
  ('Town Hall Junction', 6.9165, 79.8637, 500),
  ('Kollupitiya Junction', 6.9065, 79.8487, 500),
  ('Bambalapitiya Junction', 6.8917, 79.8565, 500),
  ('Wellawatte Junction', 6.8749, 79.8606, 500),
  ('Slave Island Junction', 6.9250, 79.8508, 500)
) as j(name, latitude, longitude, geofence_radius)
where not exists (select 1 from public.junctions);

insert into public.ambulances (vehicle_number, driver_id, status)
select * from (values
  ('RR-101', null::uuid, 'AVAILABLE'),
  ('RR-104', null::uuid, 'AVAILABLE'),
  ('RR-112', null::uuid, 'AVAILABLE')
) as a(vehicle_number, driver_id, status)
where not exists (select 1 from public.ambulances);