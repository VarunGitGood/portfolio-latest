import { createTimeline, stagger, svg } from "animejs";
import { content } from "../data";
import { startTaglines } from "./hero";

// Boot: the frame doesn't scale in — it condenses out of the smoke. Backdrop
// blur ramps 0→15px (glass fogging into existence), a light traces the border,
// then the name sharpens letter by letter and the UI follows.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

export function initBoot(): void {
  const frame = document.getElementById("frame")!;
  const nameEl = document.getElementById("name")!;
  const askbar = document.getElementById("askbar")!;
  const dock = document.getElementById("dock")!;
  const credit = document.querySelector<HTMLElement>(".credit")!;

  if (reduce) {
    nameEl.textContent = content.name;
    [frame, askbar, dock, credit].forEach((el) => (el.style.opacity = "1"));
    frame.classList.add("booted");
    startTaglines();
    return;
  }

  // per-letter spans so the name can sharpen with a stagger
  nameEl.innerHTML = content.name
    .split("")
    .map((c) => `<span class="ch">${c === " " ? "&nbsp;" : c}</span>`)
    .join("");
  const letters = nameEl.querySelectorAll(".ch");

  // one-shot border light — lives in #stage (not the frame) so it can draw
  // over empty smoke while the frame itself doesn't exist yet
  const r = frame.getBoundingClientRect();
  const ns = "http://www.w3.org/2000/svg";
  const lineSvg = document.createElementNS(ns, "svg");
  lineSvg.setAttribute("class", "bootline");
  lineSvg.setAttribute("viewBox", `0 0 ${r.width} ${r.height}`);
  lineSvg.style.left = r.left + "px";
  lineSvg.style.top = r.top + "px";
  lineSvg.style.width = r.width + "px";
  lineSvg.style.height = r.height + "px";
  const rect = document.createElementNS(ns, "rect");
  rect.setAttribute("x", "0.75");
  rect.setAttribute("y", "0.75");
  rect.setAttribute("width", String(r.width - 1.5));
  rect.setAttribute("height", String(r.height - 1.5));
  rect.setAttribute("rx", "23");
  lineSvg.appendChild(rect);
  document.getElementById("stage")!.appendChild(lineSvg);
  const [line] = svg.createDrawable(rect);

  // the line closes its loop first; only then does the glass come into being
  createTimeline({ defaults: { ease: "outCubic" }, playbackRate: 1.05 })
    .add(line, { draw: ["0 0", "0 1"], duration: 1500, ease: "inOutCubic" }, 150)
    .add(frame, { opacity: [0, 1], duration: 700, ease: "outQuad" }, 1650)
    .add(
      frame,
      {
        "--boot-blur": ["0px", "15px"],
        duration: 1000,
        ease: "inOutQuad",
        onComplete: () => frame.classList.add("booted"), // hand off to the resting border glow
      },
      1700,
    )
    .add(lineSvg, { opacity: [1, 0], duration: 500, ease: "outQuad", onComplete: () => lineSvg.remove() }, 1800)
    .add(
      letters,
      {
        opacity: [0, 1],
        filter: ["blur(10px)", "blur(0px)"],
        duration: 600,
        delay: stagger(22),
        onComplete: () => startTaglines(),
      },
      2150,
    )
    .add(askbar, { opacity: [0, 1], filter: ["blur(6px)", "blur(0px)"], duration: 500 }, 2800)
    .add(dock, { opacity: [0, 1], filter: ["blur(6px)", "blur(0px)"], duration: 500 }, 3000)
    .add(credit, { opacity: [0, 1], duration: 400, ease: "outQuad" }, 3150);
}
