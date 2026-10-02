import L from "leaflet";
import type { Ambulance, Hospital, Junction } from "@/types";

const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ] as string,
  );

const ambSvg = `<svg viewBox="0 0 26 26" width="22" height="22" aria-hidden="true">
<rect x="2" y="8.5" width="14" height="10" rx="2.2" fill="#F4F8FF"/>
<path d="M16 11h3l2.6 3.2v4.3H16z" fill="#F4F8FF"/>
<rect x="6.6" y="12.4" width="5" height="1.3" fill="#E5484D"/>
<rect x="8.45" y="10.5" width="1.3" height="5" fill="#E5484D"/>
<circle cx="6.6" cy="19.6" r="1.7" fill="#0F1E33" stroke="#F4F8FF" stroke-width="1.1"/>
<circle cx="18.6" cy="19.6" r="1.7" fill="#0F1E33" stroke="#F4F8FF" stroke-width="1.1"/>
</svg>`;

const crossSvg = (fill: string) =>
  `<svg viewBox="0 0 16 16" width="14" height="14"><path d="M6 1.5h4v4.5h4.5v4H10v4.5H6V10H1.5V6H6z" fill="${fill}"/></svg>`;

const blockSvg = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M12 2.5 22 20.5H2z" fill="#F5A623"/><rect x="11.1" y="9" width="1.8" height="6" rx=".9" fill="#0B1220"/><circle cx="12" cy="17.4" r="1.1" fill="#0B1220"/></svg>`;

export function ambulanceIcon(
  a: Pick<Ambulance, "number" | "status" | "heading">,
  selected: boolean,
): L.DivIcon {
  const active = a.status === "enroute";
  const rot = Math.round(a.heading ?? 0);
  return L.divIcon({
    className: "rr-div",
    html: `<div class="rr-mk rr-amb${active ? " act" : ""}${selected ? " sel" : ""}">
      ${active ? '<span class="rr-ping"></span>' : ""}
      <span class="rr-body"><span style="display:flex;transform:rotate(${rot}deg)">${ambSvg}</span></span>
      <span class="rr-tag">${esc(a.number)}</span>
    </div>`,
    iconSize: [40, 40],
    iconAnchor: [20, 20],
  });
}

export function junctionIcon(
  j: Pick<Junction, "name" | "status">,
  selected: boolean,
): L.DivIcon {
  const label = esc(j.name.replace(" Junction", " Jn"));
  return L.divIcon({
    className: "rr-div",
    html: `<div class="rr-mk rr-junc st-${j.status}${selected ? " sel" : ""}">
      <span class="rr-sig"><i></i><i></i><i></i></span>
      <span class="rr-tag">${label}</span>
    </div>`,
    iconSize: [18, 30],
    iconAnchor: [9, 15],
  });
}

export function hospitalIcon(
  h: Pick<Hospital, "name">,
  selected: boolean,
): L.DivIcon {
  const label = esc(h.name.replace(" Hospital", ""));
  return L.divIcon({
    className: "rr-div",
    html: `<div class="rr-mk rr-hosp${selected ? " sel" : ""}">
      <span class="rr-body round">${crossSvg("#7DE2A8")}</span>
      <span class="rr-tag">${label}</span>
    </div>`,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });
}

export function roadblockIcon(): L.DivIcon {
  return L.divIcon({
    className: "rr-div",
    html: `<div class="rr-mk"><span class="rr-body" style="border-color:#F5A623;border-radius:50%">${blockSvg}</span></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}
