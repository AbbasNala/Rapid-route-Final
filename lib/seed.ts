import type { AppState, Coord, Junction } from "@/types";
import {
  computeMilestones,
  cumulative,
  densify,
  pointAtDistance,
} from "./geofencing";

/** Demo start position for RR-101 (Koramangala area, Bengaluru — demo data). */
export const DEMO_ROUTE_BASE: Coord = [12.942, 77.617];

/** Hand-authored demo corridors (waypoints) used when openrouteservice is unavailable.
 *  They deliberately pass through the seeded junctions so the geofencing demo works. */
export const DEMO_ROUTE_WAYPOINTS: Record<string, Coord[]> = {
  "h-city": [
    [12.942, 77.617],
    [12.949, 77.612],
    [12.956, 77.609],
    [12.962, 77.608],
    [12.97, 77.607],
    [12.9748, 77.606],
    [12.9752, 77.602],
    [12.9712, 77.599],
    [12.9663, 77.5961],
    [12.9636, 77.592],
    [12.9625, 77.588],
    [12.963, 77.582],
    [12.9634, 77.579],
    [12.9644, 77.5755],
    [12.9636, 77.576],
  ],
  "h-stjohns": [
    [12.942, 77.617],
    [12.9385, 77.6185],
    [12.9355, 77.6195],
    [12.932, 77.62],
    [12.9295, 77.6202],
    [12.929, 77.6204],
  ],
  "h-manipal": [
    [12.942, 77.617],
    [12.9395, 77.618],
    [12.9355, 77.6195],
    [12.9342, 77.615],
    [12.9338, 77.61],
    [12.9342, 77.6075],
    [12.9345, 77.6067],
  ],
  "h-apollo": [
    [12.942, 77.617],
    [12.956, 77.609],
    [12.97, 77.607],
    [12.9748, 77.606],
    [12.976, 77.601],
    [12.9758, 77.5975],
    [12.974, 77.592],
    [12.9775, 77.589],
    [12.983, 77.5895],
    [12.988, 77.593],
    [12.99, 77.5955],
  ],
};

/** RR-107 is seeded mid-journey so the police dashboard is populated from the first second. */
const RR107_WAYPOINTS: Coord[] = [
  [12.93, 77.622],
  [12.932, 77.6215],
  [12.9355, 77.6195],
  [12.9342, 77.615],
  [12.9338, 77.61],
  [12.9342, 77.6075],
  [12.9345, 77.6067],
];

const now = Date.now();

export function createSeedState(): AppState {
  const hospitals: AppState["hospitals"] = [
    {
      id: "h-city",
      name: "City Hospital",
      lat: 12.9636,
      lng: 77.576,
      address: "Fort Rd (demo), Bengaluru 560002",
    },
    {
      id: "h-stjohns",
      name: "St. John's Hospital",
      lat: 12.929,
      lng: 77.6204,
      address: "Sarjapur Rd (demo), Bengaluru 560034",
    },
    {
      id: "h-manipal",
      name: "Manipal Hospital",
      lat: 12.9345,
      lng: 77.6067,
      address: "Old Airport Rd (demo), Bengaluru 560017",
    },
    {
      id: "h-apollo",
      name: "Apollo Hospital",
      lat: 12.99,
      lng: 77.5955,
      address: "Millers Rd (demo), Bengaluru 560006",
    },
  ];

  const junctions: Junction[] = [
    {
      id: "j-central",
      name: "Central Junction",
      lat: 12.974,
      lng: 77.592,
      alertRadius: 500,
      status: "monitoring",
      traffic: "medium",
      officer: "Insp. R. Iyer",
      officerPhone: "+91 90000 11001",
    },
    {
      id: "j-richmond",
      name: "Richmond Junction",
      lat: 12.9663,
      lng: 77.5961,
      alertRadius: 500,
      status: "monitoring",
      traffic: "high",
      officer: "SI Kavya Reddy",
      officerPhone: "+91 90000 11002",
    },
    {
      id: "j-mgroad",
      name: "MG Road Junction",
      lat: 12.9748,
      lng: 77.606,
      alertRadius: 450,
      status: "monitoring",
      traffic: "high",
      officer: "SI Arjun Menon",
      officerPhone: "+91 90000 11003",
    },
    {
      id: "j-hospital",
      name: "Hospital Junction",
      lat: 12.9644,
      lng: 77.5755,
      alertRadius: 400,
      status: "monitoring",
      traffic: "medium",
      officer: "HC Suresh Babu",
      officerPhone: "+91 90000 11004",
    },
    {
      id: "j-residency",
      name: "Residency Road Junction",
      lat: 12.9625,
      lng: 77.588,
      alertRadius: 450,
      status: "monitoring",
      traffic: "low",
      officer: "SI Farida Khan",
      officerPhone: "+91 90000 11005",
    },
    {
      id: "j-sarjapur",
      name: "Sarjapur Road Junction",
      lat: 12.9355,
      lng: 77.6195,
      alertRadius: 500,
      status: "preparing",
      traffic: "medium",
      officer: "SI Dinesh Kumar",
      officerPhone: "+91 90000 11006",
    },
  ];

  // RR-107: pre-built active journey, ~350 m before Sarjapur Road Junction, alert already acknowledged.
  const route = densify(RR107_WAYPOINTS);
  const cum = cumulative(route);
  const milestones = computeMilestones(route, junctions);
  const sarjapur = milestones.find((m) => m.junctionId === "j-sarjapur") ?? {
    junctionId: "j-sarjapur",
    atM: cum[cum.length - 1] * 0.3,
  };
  const traveled = Math.max(0, sarjapur.atM - 350);
  const pos = pointAtDistance(route, cum, traveled);

  const journeys: AppState["journeys"] = [
    {
      id: "jn-107",
      ambulanceId: "a-107",
      ambulanceNumber: "RR-107",
      driverName: "Vikram Rao",
      hospitalId: "h-manipal",
      hospitalName: "Manipal Hospital",
      route,
      routeSource: "demo",
      routeLengthM: cum[cum.length - 1],
      traveledM: traveled,
      speedMps: 11.1,
      milestones,
      status: "active",
      startedAt: now - 120000,
    },
    {
      id: "jn-hist-1",
      ambulanceId: "a-104",
      ambulanceNumber: "RR-104",
      driverName: "Meera Nair",
      hospitalId: "h-stjohns",
      hospitalName: "St. John's Hospital",
      route: [],
      routeSource: "demo",
      routeLengthM: 4100,
      traveledM: 4100,
      speedMps: 11.1,
      milestones: [],
      status: "completed",
      startedAt: now - 9360000,
      completedAt: now - 8820000,
      durationSec: 900,
    },
    {
      id: "jn-hist-2",
      ambulanceId: "a-102",
      ambulanceNumber: "RR-102",
      driverName: "P. Sathish",
      hospitalId: "h-city",
      hospitalName: "City Hospital",
      route: [],
      routeSource: "demo",
      routeLengthM: 7900,
      traveledM: 7900,
      speedMps: 11.1,
      milestones: [],
      status: "completed",
      startedAt: now - 14760000,
      completedAt: now - 13500000,
      durationSec: 1260,
    },
    {
      id: "jn-hist-3",
      ambulanceId: "a-105",
      ambulanceNumber: "RR-105",
      driverName: "Latha Krishnan",
      hospitalId: "h-apollo",
      hospitalName: "Apollo Hospital",
      route: [],
      routeSource: "demo",
      routeLengthM: 6400,
      traveledM: 6400,
      speedMps: 11.1,
      milestones: [],
      status: "completed",
      startedAt: now - 19800000,
      completedAt: now - 18840000,
      durationSec: 960,
    },
  ];

  return {
    session: null,
    hospitals,
    junctions,
    ambulances: [
      {
        id: "a-101",
        number: "RR-101",
        driverName: "Arun Kumar",
        status: "available",
        lat: DEMO_ROUTE_BASE[0],
        lng: DEMO_ROUTE_BASE[1],
        activeJourneyId: null,
        selectedHospitalId: null,
        previewRoute: null,
        previewLoading: false,
        lastCompletedJourneyId: null,
      },
      {
        id: "a-104",
        number: "RR-104",
        driverName: "Meera Nair",
        status: "available",
        lat: 12.956,
        lng: 77.628,
        activeJourneyId: null,
        selectedHospitalId: null,
        previewRoute: null,
        previewLoading: false,
        lastCompletedJourneyId: null,
      },
      {
        id: "a-107",
        number: "RR-107",
        driverName: "Vikram Rao",
        status: "enroute",
        lat: pos.coord[0],
        lng: pos.coord[1],
        heading: pos.heading,
        activeJourneyId: "jn-107",
        selectedHospitalId: "h-manipal",
        previewRoute: null,
        previewLoading: false,
        lastCompletedJourneyId: null,
      },
    ],
    journeys,
    alerts: [
      {
        id: "al-seed-1",
        journeyId: "jn-107",
        ambulanceId: "a-107",
        ambulanceNumber: "RR-107",
        junctionId: "j-sarjapur",
        junctionName: "Sarjapur Road Junction",
        hospitalName: "Manipal Hospital",
        driverName: "Vikram Rao",
        etaSec: 32,
        status: "acknowledged",
        traffic: "medium",
        createdAt: now - 90000,
        acknowledgedAt: now - 45000,
        officer: "SI Dinesh Kumar",
      },
    ],
    roadblocks: [],
    completedToday: 7,
    live: false, // ← add
    hospitalsLoading: false, // ← add
    sim: { active: false, speed: 6, lastTick: 0, ownerTab: null },
    connection: { mode: "local", status: "offline" },
  };
}
