"use client";

import { useState } from "react";
import { CheckCircle2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { cn } from "@/lib/utils";
import type { RoadblockType } from "@/types";


const OPTIONS: Array<{ type: RoadblockType; label: string; desc: string }> = [
  {
    type: "accident",
    label: "Accident",
    desc: "Collision or vehicle incident",
  },
  {
    type: "road_blocked",
    label: "Road blocked",
    desc: "Physical blockage or closure",
  },
  {
    type: "congestion",
    label: "Heavy congestion",
    desc: "Severe slow-moving traffic",
  },
  { type: "other", label: "Other", desc: "Anything else affecting passage" },
];

export function RoadblockSheet({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (type: RoadblockType, note?: string) => void;
}) {
  const [type, setType] = useState<RoadblockType | null>(null);
  const [note, setNote] = useState("");

  function submit() {
    if (!type) return;
    onSubmit(type, note.trim() || undefined);
    setType(null);
    setNote("");
    onClose();
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Report roadblock"
      footer={
        <div className="space-y-3">
          <Button
            variant="amber"
            size="lg"
            className="w-full"
            disabled={!type}
            onClick={submit}
          >
            <TriangleAlert size={18} /> SUBMIT REPORT
          </Button>
          <p className="flex items-center justify-center gap-1.5 text-[11px] text-muted">
            <CheckCircle2 size={13} className="text-success" /> Traffic
            authorities have been notified on submission
          </p>
        </div>
      }
    >
      <div className="grid grid-cols-2 gap-2">
        {OPTIONS.map((o) => (
          <button
            key={o.type}
            onClick={() => setType(o.type)}
            className={cn(
              "rounded-xl border p-4 text-left transition-colors",
              type === o.type
                ? "border-amber bg-amber/10"
                : "border-line bg-ink hover:border-slate-500",
            )}
          >
            <div className="text-base font-bold">{o.label}</div>
            <div className="mt-1 text-[11px] leading-snug text-muted">
              {o.desc}
            </div>
          </button>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        placeholder="Optional note for the traffic team"
        className="mt-3 w-full rounded-xl border border-line bg-ink p-3 text-sm outline-none focus:border-slate-400"
      />
    </Modal>
  );
}
