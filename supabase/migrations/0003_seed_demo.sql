-- Bangalore seed data for RapidRoute.
-- Used to provide an initial local dataset for development/testing.
-- In production, manage operational records through the admin dashboard.

-- ============================================================
-- HOSPITALS
-- ============================================================

insert into public.hospitals (
  name,
  address,
  phone,
  emergency_capability,
  latitude,
  longitude
)
select * from (
  values

  (
    'Victoria Hospital',
    'Near City Market, Fort Road, Bengaluru, Karnataka 560002',
    '080-26701150',
    'General Emergency | Trauma | Burns',
    12.963389,
    77.573819
  ),

  (
    'St. John''s Medical College Hospital',
    'Sarjapur Main Road, Bengaluru, Karnataka 560034',
    '080-25530724',
    'Emergency | Trauma | Cardiac | ICU',
    12.929650,
    77.618698
  ),

  (
    'M.S. Ramaiah Memorial Hospital',
    'New BEL Road, M.S. Ramaiah Nagar, Bengaluru, Karnataka 560054',
    '080-23608888',
    'Emergency | Trauma | ICU',
    13.028545,
    77.569479
  ),

  (
    'St. Philomena''s Hospital',
    'No. 4, Mother Theresa Road, Vivek Nagar, Bengaluru, Karnataka 560047',
    '080-40164433',
    'Emergency | General',
    12.965323,
    77.611051
  ),

  (
    'Vanivilas Women and Children Hospital',
    'Krishnarajendra Road, Bengaluru, Karnataka',
    '080-26705206',
    'Emergency | Women | Children',
    12.962138,
    77.573752
  ),

  (
    'St. Martha''s Heart Centre',
    '5, Nrupathunga Road, Bengaluru, Karnataka 560001',
    '18602080208',
    'Cardiac Emergency | ICU',
    12.970788,
    77.586195
  ),

  (
    'Mallya Hospital',
    'No. 2, Vittal Mallya Road, Ashok Nagar, Bengaluru, Karnataka 560001',
    '080-22277979',
    'Emergency | General | ICU',
    12.968183,
    77.594985
  ),

  -- (
  --   'Manipal Hospital Old Airport Road',
  --   '98, HAL Airport Road, Kodihalli, Bengaluru, Karnataka 560017',
  --   '080-25268901',
  --   'Emergency | Trauma | Cardiac | ICU',
  --   12.959127,
  --   77.647366
  -- )
 as h(
  name,
  address,
  phone,
  emergency_capability,
  latitude,
  longitude
)
where not exists (
  select 1 from public.hospitals
);


-- ============================================================
-- JUNCTIONS
-- ============================================================

insert into public.junctions (
  name,
  latitude,
  longitude,
  geofence_radius
)
select * from (
  values

  (
    'Trinity Circle',
    12.97278,
    77.62058,
    500
  ),

  (
    'Richmond Circle',
    12.96758,
    77.59958,
    500
  ),

  (
    'Mekhri Circle',
    13.02005,
    77.58402,
    500
  ),

  (
    'Silk Board Junction',
    12.91700,
    77.62300,
    500
  ),

  (
    'Ejipura Junction',
    12.93863,
    77.63346,
    500
  ),

  (
    'KR Market Junction',
    12.96571,
    77.57627,
    500
  ),

  (
    'Shivajinagar Junction',
    12.98553,
    77.60545,
    500
  ),

  (
    'Srinivagilu Junction',
    12.93827,
    77.63284,
    500
  )

) as j(
  name,
  latitude,
  longitude,
  geofence_radius
)
where not exists (
  select 1 from public.junctions
);


-- ============================================================
-- AMBULANCES
-- ============================================================

insert into public.ambulances (
  vehicle_number,
  driver_id,
  status
)
select * from (
  values

  ('RR-101', null::uuid, 'AVAILABLE'),
  ('RR-104', null::uuid, 'AVAILABLE'),
  ('RR-112', null::uuid, 'AVAILABLE')

) as a(
  vehicle_number,
  driver_id,
  status
)
where not exists (
  select 1 from public.ambulances
);