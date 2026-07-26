import { openSection, type Section } from "./stream";

const SECTIONS: { sec: Section; label: string }[] = [
  { sec: "about", label: "About" },
  { sec: "projects", label: "Projects" },
  { sec: "skills", label: "Skills" },
  { sec: "experience", label: "Experience" },
  { sec: "contact", label: "Contact" },
];

/** Tabs live permanently at the bottom of the frame. */
export function initDock(): void {
  const dock = document.getElementById("dock")!;
  dock.innerHTML = SECTIONS.map((s) => `<div class="pill" data-sec="${s.sec}"><i></i>${s.label}</div>`).join("");
  const pills = dock.querySelectorAll<HTMLElement>(".pill");
  pills.forEach((p) => {
    p.onclick = () => {
      pills.forEach((x) => x.classList.remove("active"));
      p.classList.add("active");
      openSection(p.dataset.sec as Section);
    };
  });
}
