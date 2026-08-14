import { bus } from "../bus";
import { openSection, type Section } from "./stream";

const SECTIONS: { sec: Section; label: string }[] = [
  { sec: "about", label: "About" },
  { sec: "projects", label: "Projects" },
  { sec: "skills", label: "Skills" },
  { sec: "experience", label: "Experience" },
  { sec: "contact", label: "Contact" },
];

/** The landing stack (bar → chips → tabs) is laid out by offsets, so the two
 *  variable-height rows report their real height instead of being guessed at.
 *  Called again by initChat once the chips exist, and on resize. */
export function measureCluster(): void {
  const frame = document.getElementById("frame");
  const dock = document.getElementById("dock");
  const sugg = document.getElementById("sugg");
  const bar = document.getElementById("askbar");
  if (!frame) return;
  if (bar) frame.style.setProperty("--bar-half", bar.offsetHeight / 2 + "px");
  if (dock) frame.style.setProperty("--pill-h", dock.offsetHeight + "px");
  // the chip row carries its own 14px gap, so it collapses to nothing when the
  // short-viewport tier hides it and the tabs slide up on their own
  if (sugg) frame.style.setProperty("--sugg-h", (sugg.offsetHeight ? sugg.offsetHeight + 14 : 0) + "px");
}

/** Tabs live permanently at the bottom of the frame. */
export function initDock(): void {
  const dock = document.getElementById("dock")!;
  dock.setAttribute("role", "tablist");
  dock.innerHTML = SECTIONS.map(
    (s) => `<div class="pill" role="tab" tabindex="0" aria-selected="false" data-sec="${s.sec}">${s.label}</div>`,
  ).join("");
  const pills = dock.querySelectorAll<HTMLElement>(".pill");
  pills.forEach((p) => {
    p.onclick = () => openSection(p.dataset.sec as Section);
    p.onkeydown = (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        openSection(p.dataset.sec as Section);
      }
    };
  });

  // the stream owns which section is current — undocking clears it
  bus.on("section", (sec) => {
    pills.forEach((p) => {
      const on = p.dataset.sec === sec;
      p.classList.toggle("active", on);
      p.setAttribute("aria-selected", String(on));
    });
  });

  measureCluster();
  addEventListener("resize", measureCluster);
  // the webfonts land after first paint and change both rows' height
  document.fonts?.ready.then(measureCluster);
}
