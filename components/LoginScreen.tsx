"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Ambulance, CheckCircle2, ChevronRight, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { store, useAppState, useHydrated } from "@/lib/store";
import { Splash } from "@/components/Splash";
import { cn } from "@/lib/utils";
import type { Role } from "@/types";

export default function LoginScreen() {
  const state = useAppState();
  const hydrated = useHydrated();
  const router = useRouter();
  const [role, setRole] = useState<Role | null>(null);
  const [ambulanceId, setAmbulanceId] = useState("a-101");
  const [officerName, setOfficerName] = useState("Officer Priya Sharma");
  const [zone, setZone] = useState("Central Zone");

  useEffect(() => {
    if (hydrated && state.session) {
      router.replace(
        state.session.role === "traffic_police" ? "/police" : "/ambulance",
      );
    }
  }, [hydrated, state.session, router]);

  if (!hydrated || state.session) return <Splash label="RapidRoute" />;

  const chosenAmbulance = state.ambulances.find((a) => a.id === ambulanceId);

  function handleContinue() {
    if (role === "ambulance_driver" && chosenAmbulance) {
      store.setSession({
        role,
        name: chosenAmbulance.driverName,
        ambulanceId: chosenAmbulance.id,
      });
      router.push("/ambulance");
    } else if (role === "traffic_police") {
      store.setSession({ role, name: officerName, zone });
      router.push("/police");
    }
  }

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-emergency">
            <svg viewBox="0 0 16 16" width="26" height="26">
              <path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="#fff" />
            </svg>
          </div>
          <h1 className="text-3xl font-extrabold tracking-wider">RAPIDROUTE</h1>
          <p className="mt-2 text-xs font-semibold tracking-[0.22em] text-muted">
            AMBULANCE · TRAFFIC POLICE COORDINATION
          </p>
        </div>

        <p className="mb-3 text-sm font-semibold text-slate-200">
          Choose your role
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <RoleCard
            selected={role === "ambulance_driver"}
            onClick={() => setRole("ambulance_driver")}
            icon={<Ambulance size={22} />}
            title="Ambulance Driver"
            desc="Start an emergency route, get navigation and junction ETAs."
          />
          <RoleCard
            selected={role === "traffic_police"}
            onClick={() => setRole("traffic_police")}
            icon={<Shield size={22} />}
            title="Traffic Police"
            desc="Monitor ambulances, receive and acknowledge junction alerts."
          />
        </div>

        {role === "ambulance_driver" && (
          <div className="mt-5">
            <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
              Select ambulance
            </p>
            <div className="grid grid-cols-3 gap-2">
              {state.ambulances.map((a) => (
                <button
                  key={a.id}
                  onClick={() => setAmbulanceId(a.id)}
                  className={cn(
                    "rounded-xl border p-3 text-left transition-colors",
                    ambulanceId === a.id
                      ? "border-white bg-panel-2"
                      : "border-line bg-panel hover:border-slate-500",
                  )}
                >
                  <div className="font-mono text-sm font-semibold">
                    {a.number}
                  </div>
                  <div className="mt-0.5 truncate text-[11px] text-muted">
                    {a.driverName}
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {role === "traffic_police" && (
          <div className="mt-5 space-y-3">
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Officer name
              </p>
              <input
                value={officerName}
                onChange={(e) => setOfficerName(e.target.value)}
                className="h-12 w-full rounded-xl border border-line bg-ink px-4 text-sm outline-none focus:border-slate-400"
                placeholder="Your name"
              />
            </div>
            <div>
              <p className="mb-2 text-xs font-bold uppercase tracking-[0.14em] text-muted">
                Zone
              </p>
              <div className="grid grid-cols-3 gap-2">
                {["Central Zone", "South Zone", "East Zone"].map((z) => (
                  <button
                    key={z}
                    onClick={() => setZone(z)}
                    className={cn(
                      "h-11 rounded-xl border text-xs font-semibold transition-colors",
                      zone === z
                        ? "border-white bg-panel-2"
                        : "border-line bg-panel hover:border-slate-500",
                    )}
                  >
                    {z.replace(" Zone", "")}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        <Button
          variant="primary"
          size="xl"
          className="mt-6 w-full"
          disabled={!role}
          onClick={handleContinue}
        >
          ENTER OPERATIONS <ChevronRight size={20} />
        </Button>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-muted">
          Hackathon demo build — roles are demo accounts and all movement is
          simulated locally. No real emergency service or traffic infrastructure
          is connected.
        </p>
      </div>
    </main>
  );
}

function RoleCard({
  selected,
  onClick,
  icon,
  title,
  desc,
}: {
  selected: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "relative rounded-2xl border p-5 text-left transition-colors",
        selected
          ? "border-white bg-panel-2"
          : "border-line bg-panel hover:border-slate-500",
      )}
    >
      {selected && (
        <CheckCircle2
          size={18}
          className="absolute right-4 top-4 text-success"
        />
      )}
      <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-ink text-slate-100">
        {icon}
      </div>
      <div className="text-lg font-bold">{title}</div>
      <div className="mt-1 text-xs leading-relaxed text-muted">{desc}</div>
    </button>
  );
}
