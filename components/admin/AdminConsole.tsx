"use client";
// Admin console: manage ambulances, hospitals, junctions (+ geofence radii) and
// users. Visually plain by design — the goal is a configurable system, not polish.
import * as React from "react";
import { useRouter } from "next/navigation";
import { Ambulance, Building2, CircleDot, LogOut, MapPin, Plus, Trash2, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import { useToast } from "@/components/ui/toast";
import { DynamicMap } from "@/components/maps/DynamicMap";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { ROLE_LABEL } from "@/lib/auth/guards";
import type {
  AmbulancesRow,
  HospitalsRow,
  JunctionsRow,
  UsersRow,
} from "@/types/database";

type Tab = "hospitals" | "junctions" | "ambulances" | "users";

interface Props {
  viewer: UsersRow;
  ambulances: AmbulancesRow[];
  hospitals: HospitalsRow[];
  junctions: JunctionsRow[];
  users: UsersRow[];
}

export function AdminConsole({ viewer, ambulances: initialAmbulances, hospitals: initialHospitals, junctions: initialJunctions, users: initialUsers }: Props) {
  const supabase = React.useMemo(() => createClient(), []);
  const toast = useToast();
  const router = useRouter();
  const [tab, setTab] = React.useState<Tab>("junctions");
  const [ambulances, setAmbulances] = React.useState(initialAmbulances);
  const [hospitals, setHospitals] = React.useState(initialHospitals);
  const [junctions, setJunctions] = React.useState(initialJunctions);
  const [users, setUsers] = React.useState(initialUsers);
  const usersById = React.useMemo(() => Object.fromEntries(users.map((u) => [u.id, u])), [users]);
  const drivers = users.filter((u) => u.role === "ambulance_driver");

  async function refresh(table: "ambulances" | "hospitals" | "junctions" | "users") {
    const { data, error } = await supabase.from(table).select("*");
    if (error) { toast.error(`Refresh failed: ${error.message}`); return; }
    if (table === "ambulances") setAmbulances((data ?? []) as AmbulancesRow[]);
    if (table === "hospitals") setHospitals((data ?? []) as HospitalsRow[]);
    if (table === "junctions") setJunctions((data ?? []) as JunctionsRow[]);
    if (table === "users") setUsers((data ?? []) as UsersRow[]);
  }

  async function signOut() {
    await supabase.auth.signOut();
    router.replace("/login");
    router.refresh();
  }

  const TABS: Array<{ id: Tab; label: string; icon: React.ReactNode }> = [
    { id: "junctions", label: "Junctions", icon: <CircleDot className="h-4 w-4" /> },
    { id: "hospitals", label: "Hospitals", icon: <Building2 className="h-4 w-4" /> },
    { id: "ambulances", label: "Ambulances", icon: <Ambulance className="h-4 w-4" /> },
    { id: "users", label: "Users", icon: <Users className="h-4 w-4" /> },
  ];

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl font-bold uppercase tracking-wide">RapidRoute admin</h1>
          <p className="text-xs uppercase tracking-[0.2em] text-ops-400">
            Signed in as {viewer.name} · {ROLE_LABEL[viewer.role]}
          </p>
        </div>
        <Button variant="ghost" onClick={signOut}><LogOut className="h-4 w-4" aria-hidden="true" /> Sign out</Button>
      </header>

      <nav className="mb-5 flex gap-1 rounded-lg border border-ops-700 bg-ops-900 p-1" role="tablist">
        {TABS.map((t) => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("flex h-11 flex-1 items-center justify-center gap-2 rounded-md text-sm font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-warn",
              tab === t.id ? "bg-ops-700 text-white" : "text-ops-400 hover:text-ops-300")}>
            {t.icon}{t.label}
          </button>
        ))}
      </nav>

      {tab === "junctions" && (
        <JunctionsTab junctions={junctions} drivers={drivers} usersById={usersById}
          onSaved={() => refresh("junctions")} refresh={refresh} toast={toast} supabase={supabase} />
      )}
      {tab === "hospitals" && (
        <HospitalsTab hospitals={hospitals} onSaved={() => refresh("hospitals")} toast={toast} supabase={supabase} />
      )}
      {tab === "ambulances" && (
        <AmbulancesTab ambulances={ambulances} drivers={drivers} usersById={usersById}
          onSaved={() => refresh("ambulances")} toast={toast} supabase={supabase} />
      )}
      {tab === "users" && (
        <UsersTab users={users} onSaved={() => refresh("users")} toast={toast} />
      )}
    </main>
  );
}

type Toast = ReturnType<typeof useToast>;
type Supabase = ReturnType<typeof createClient>;

function JunctionsTab({ junctions, onSaved, refresh, toast, supabase }: {
  junctions: JunctionsRow[]; drivers: UsersRow[]; usersById: Record<string, UsersRow>;
  onSaved: () => void; refresh: (t: "junctions") => Promise<void>;
  toast: Toast; supabase: Supabase;
}) {
  const [name, setName] = React.useState("");
  const [radius, setRadius] = React.useState(500);
  const [lat, setLat] = React.useState<number | null>(null);
  const [lng, setLng] = React.useState<number | null>(null);

  async function create() {
    if (!name.trim() || lat == null || lng == null) { toast.error("Name and map position are required."); return; }
    const { error } = await supabase.from("junctions")
      .insert({ name: name.trim(), latitude: lat, longitude: lng, geofence_radius: radius });
    if (error) { toast.error(error.message); return; }
    setName(""); setLat(null); setLng(null); setRadius(500);
    toast.success("Junction added."); onSaved();
  }

  async function saveRadius(j: JunctionsRow, r: number) {
    const { error } = await supabase.from("junctions").update({ geofence_radius: r }).eq("id", j.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Geofence radius updated."); await refresh("junctions");
  }

  async function remove(j: JunctionsRow) {
    const { error } = await supabase.from("junctions").delete().eq("id", j.id);
    if (error) { toast.error("Could not delete — this junction has alert history."); return; }
    toast.success("Junction deleted."); onSaved();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-ops-700 bg-ops-900 p-4">
        <h2 className="font-display text-lg font-semibold uppercase">Add junction</h2>
        <p className="text-xs text-ops-400">Click the map to place the junction, then set its geofence radius.</p>
        <div className="h-64">
          <DynamicMap
            className="h-full w-full rounded-lg"
            junctions={junctions.map((j) => ({ id: j.id, position: [j.latitude, j.longitude], radiusM: j.geofence_radius, label: j.name, state: "monitoring" as const }))}
            onMapClick={(a, b) => { setLat(a); setLng(b); }}
            fit={{ token: 1, bounds: junctions.map((j) => [j.latitude, j.longitude] as [number, number]) }}
          />
        </div>
        <div><Label htmlFor="j-name">Name</Label>
          <Input id="j-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Richmond Junction" /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="j-radius">Geofence radius (m)</Label>
            <Input id="j-radius" type="number" min={50} max={5000} value={radius}
              onChange={(e) => setRadius(Number(e.target.value))} /></div>
          <div className="grid grid-cols-2 gap-2">
            <div><Label htmlFor="j-lat">Latitude</Label>
              <Input id="j-lat" className="font-mono" value={lat?.toFixed(5) ?? ""} readOnly placeholder="map click" /></div>
            <div><Label htmlFor="j-lng">Longitude</Label>
              <Input id="j-lng" className="font-mono" value={lng?.toFixed(5) ?? ""} readOnly placeholder="map click" /></div>
          </div>
        </div>
        <Button onClick={create} disabled={!name.trim() || lat == null}><Plus className="h-4 w-4" aria-hidden="true" /> Add junction</Button>
      </div>

      <div className="rounded-xl border border-ops-700 bg-ops-900">
        <h2 className="border-b border-ops-700 px-4 py-3 font-display text-lg font-semibold uppercase">
          Junctions ({junctions.length})
        </h2>
        <ul className="divide-y divide-ops-800">
          {junctions.map((j) => (
            <li key={j.id} className="flex items-center gap-3 px-4 py-3">
              <MapPin className="h-4 w-4 shrink-0 text-warn" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{j.name}</p>
                <p className="font-mono text-[11px] text-ops-400">{j.latitude.toFixed(5)}, {j.longitude.toFixed(5)}</p>
              </div>
              <Input type="number" min={50} max={5000} defaultValue={j.geofence_radius} className="w-28"
                aria-label={`Geofence radius for ${j.name}`}
                onBlur={(e) => { const v = Number(e.target.value); if (v !== j.geofence_radius && v >= 50 && v <= 5000) saveRadius(j, v); }} />
              <button aria-label={`Delete ${j.name}`} onClick={() => remove(j)}
                className="rounded-lg p-2 text-ops-400 hover:bg-ops-800 hover:text-emergency-bright">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {junctions.length === 0 && <li className="px-4 py-6 text-sm text-ops-400">No junctions yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function HospitalsTab({ hospitals, onSaved, toast, supabase }: {
  hospitals: HospitalsRow[]; onSaved: () => void; toast: Toast; supabase: Supabase;
}) {
  const [form, setForm] = React.useState({ name: "", address: "", phone: "", capability: "", latitude: "", longitude: "" });
  const [geocoding, setGeocoding] = React.useState(false);

  async function geocode() {
    if (form.address.trim().length < 3) { toast.error("Enter an address first."); return; }
    setGeocoding(true);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(form.address.trim())}`);
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? "Geocoding failed."); return; }
      const first = data.results?.[0];
      if (!first) { toast.error("No match found — enter coordinates manually."); return; }
      setForm((f) => ({ ...f, latitude: String(first.latitude), longitude: String(first.longitude) }));
      toast.success("Coordinates filled from address.");
    } finally { setGeocoding(false); }
  }

  async function create() {
    const lat = Number(form.latitude), lng = Number(form.longitude);
    if (!form.name.trim() || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      toast.error("Name and valid coordinates are required."); return;
    }
    const { error } = await supabase.from("hospitals").insert({
      name: form.name.trim(), address: form.address.trim(), phone: form.phone.trim(),
      emergency_capability: form.capability.trim() || null, latitude: lat, longitude: lng,
    });
    if (error) { toast.error(error.message); return; }
    setForm({ name: "", address: "", phone: "", capability: "", latitude: "", longitude: "" });
    toast.success("Hospital added."); onSaved();
  }

  async function remove(h: HospitalsRow) {
    const { error } = await supabase.from("hospitals").delete().eq("id", h.id);
    if (error) { toast.error("Could not delete — this hospital has journey history."); return; }
    toast.success("Hospital deleted."); onSaved();
  }

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-ops-700 bg-ops-900 p-4">
        <h2 className="font-display text-lg font-semibold uppercase">Add hospital</h2>
        <div><Label htmlFor="h-name">Name</Label><Input id="h-name" value={form.name} onChange={set("name")} /></div>
        <div>
          <Label htmlFor="h-address">Address</Label>
          <div className="flex gap-2">
            <Input id="h-address" value={form.address} onChange={set("address")} />
            <Button variant="outline" onClick={geocode} disabled={geocoding}>
              {geocoding ? "…" : "Find coords"}
            </Button>
          </div>
          <p className="mt-1 text-[11px] text-ops-400">Occasional address lookup via the server-side geocoder (rate-limited).</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="h-phone">Phone</Label><Input id="h-phone" value={form.phone} onChange={set("phone")} /></div>
          <div><Label htmlFor="h-cap">Emergency capability</Label><Input id="h-cap" value={form.capability} onChange={set("capability")} placeholder="Trauma, Cardiac…" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label htmlFor="h-lat">Latitude</Label><Input id="h-lat" className="font-mono" value={form.latitude} onChange={set("latitude")} /></div>
          <div><Label htmlFor="h-lng">Longitude</Label><Input id="h-lng" className="font-mono" value={form.longitude} onChange={set("longitude")} /></div>
        </div>
        <Button onClick={create}><Plus className="h-4 w-4" aria-hidden="true" /> Add hospital</Button>
      </div>

      <div className="rounded-xl border border-ops-700 bg-ops-900">
        <h2 className="border-b border-ops-700 px-4 py-3 font-display text-lg font-semibold uppercase">
          Hospitals ({hospitals.length})
        </h2>
        <ul className="divide-y divide-ops-800">
          {hospitals.map((h) => (
            <li key={h.id} className="flex items-center gap-3 px-4 py-3">
              <Building2 className="h-4 w-4 shrink-0 text-ok" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{h.name}</p>
                <p className="truncate text-xs text-ops-400">{h.address} · {h.phone || "no phone"}</p>
                <p className="font-mono text-[11px] text-ops-500">{h.latitude.toFixed(5)}, {h.longitude.toFixed(5)}</p>
              </div>
              <button aria-label={`Delete ${h.name}`} onClick={() => remove(h)}
                className="rounded-lg p-2 text-ops-400 hover:bg-ops-800 hover:text-emergency-bright">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {hospitals.length === 0 && <li className="px-4 py-6 text-sm text-ops-400">No hospitals yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function AmbulancesTab({ ambulances, drivers, usersById, onSaved, toast, supabase }: {
  ambulances: AmbulancesRow[]; drivers: UsersRow[]; usersById: Record<string, UsersRow>;
  onSaved: () => void; toast: Toast; supabase: Supabase;
}) {
  const [vehicleNumber, setVehicleNumber] = React.useState("");
  const [driverId, setDriverId] = React.useState("");

  async function create() {
    if (!vehicleNumber.trim()) { toast.error("Vehicle number is required."); return; }
    const { error } = await supabase.from("ambulances")
      .insert({ vehicle_number: vehicleNumber.trim().toUpperCase(), driver_id: driverId || null });
    if (error) { toast.error(error.message); return; }
    setVehicleNumber(""); setDriverId("");
    toast.success("Ambulance added."); onSaved();
  }

  async function assign(id: string, driver: string) {
    const { error } = await supabase.from("ambulances")
      .update({ driver_id: driver || null }).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Driver assignment updated."); onSaved();
  }

  async function remove(a: AmbulancesRow) {
    const { error } = await supabase.from("ambulances").delete().eq("id", a.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Ambulance deleted."); onSaved();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-ops-700 bg-ops-900 p-4">
        <h2 className="font-display text-lg font-semibold uppercase">Add ambulance</h2>
        <div><Label htmlFor="a-num">Vehicle number</Label>
          <Input id="a-num" value={vehicleNumber} onChange={(e) => setVehicleNumber(e.target.value)} placeholder="e.g. RR-104" /></div>
        <div><Label htmlFor="a-driver">Assigned driver (optional)</Label>
          <Select id="a-driver" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
            <option value="">— Unassigned —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name} ({d.email})</option>)}
          </Select></div>
        <Button onClick={create}><Plus className="h-4 w-4" aria-hidden="true" /> Add ambulance</Button>
      </div>

      <div className="rounded-xl border border-ops-700 bg-ops-900">
        <h2 className="border-b border-ops-700 px-4 py-3 font-display text-lg font-semibold uppercase">
          Ambulances ({ambulances.length})
        </h2>
        <ul className="divide-y divide-ops-800">
          {ambulances.map((a) => (
            <li key={a.id} className="flex items-center gap-3 px-4 py-3">
              <Ambulance className="h-4 w-4 shrink-0 text-ops-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-display text-lg font-bold uppercase">{a.vehicle_number}</p>
                <p className="text-xs text-ops-400">{a.status.replace("_", " ")}</p>
              </div>
              <Select className="w-48" aria-label={`Driver for ${a.vehicle_number}`}
                value={a.driver_id ?? ""} onChange={(e) => assign(a.id, e.target.value)}>
                <option value="">— Unassigned —</option>
                {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </Select>
              <button aria-label={`Delete ${a.vehicle_number}`} onClick={() => remove(a)}
                className="rounded-lg p-2 text-ops-400 hover:bg-ops-800 hover:text-emergency-bright">
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
          {ambulances.length === 0 && <li className="px-4 py-6 text-sm text-ops-400">No ambulances yet.</li>}
        </ul>
      </div>
    </div>
  );
}

function UsersTab({ users, onSaved, toast }: { users: UsersRow[]; onSaved: () => void; toast: Toast }) {
  const [form, setForm] = React.useState({ name: "", email: "", password: "", role: "traffic_police" });
  const [busy, setBusy] = React.useState(false);

  async function createUser() {
    setBusy(true);
    try {
      const res = await fetch("/api/admin/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) { toast.error(data?.error ?? "Creation failed."); return; }
      setForm({ name: "", email: "", password: "", role: "traffic_police" });
      toast.success("User created."); onSaved();
    } finally { setBusy(false); }
  }

  async function changeRole(id: string, role: string) {
    const res = await fetch("/api/admin/users", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, role }),
    });
    const data = await res.json();
    if (!res.ok) { toast.error(data?.error ?? "Role change failed."); return; }
    toast.success("Role updated."); onSaved();
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-3 rounded-xl border border-ops-700 bg-ops-900 p-4">
        <h2 className="font-display text-lg font-semibold uppercase">Create user</h2>
        <p className="text-xs text-ops-400">
          Police and admin accounts can only be created here — public sign-up is limited to ambulance drivers.
        </p>
        <div><Label htmlFor="u-name">Name</Label>
          <Input id="u-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
        <div><Label htmlFor="u-email">Email</Label>
          <Input id="u-email" type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></div>
        <div><Label htmlFor="u-pass">Temporary password</Label>
          <Input id="u-pass" type="text" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
          <p className="mt-1 text-[11px] text-ops-400">Share securely; the user should change it after first sign-in.</p></div>
        <div><Label htmlFor="u-role">Role</Label>
          <Select id="u-role" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
            <option value="traffic_police">Traffic police</option>
            <option value="ambulance_driver">Ambulance driver</option>
            <option value="admin">Administrator</option>
          </Select></div>
        <Button onClick={createUser} disabled={busy}><Plus className="h-4 w-4" aria-hidden="true" /> Create user</Button>
      </div>

      <div className="rounded-xl border border-ops-700 bg-ops-900">
        <h2 className="border-b border-ops-700 px-4 py-3 font-display text-lg font-semibold uppercase">
          Users ({users.length})
        </h2>
        <ul className="divide-y divide-ops-800">
          {users.map((u) => (
            <li key={u.id} className="flex items-center gap-3 px-4 py-3">
              <Users className="h-4 w-4 shrink-0 text-ops-300" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold">{u.name}</p>
                <p className="truncate text-xs text-ops-400">{u.email}</p>
              </div>
              <Select className="w-44" aria-label={`Role for ${u.name}`} defaultValue={u.role}
                onChange={(e) => changeRole(u.id, e.target.value)}>
                <option value="ambulance_driver">Ambulance driver</option>
                <option value="traffic_police">Traffic police</option>
                <option value="admin">Administrator</option>
              </Select>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}