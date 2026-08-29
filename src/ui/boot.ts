import { createTimeline, stagger, svg } from "animejs";
import { bus } from "../bus";
import { content } from "../data";

// Boot: the frame doesn't scale in - it condenses out of the smoke. A light
// traces the border, the glass fades up, then the name materializes letter by
// letter and the UI follows.

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// Every face the boot timeline paints. `document.fonts.ready` alone is not
// enough: at gate time the page shows almost no text, so nothing is pending and
// it resolves instantly - then the name lands in Geist mid-animation and the
// fetch + decode stalls the frame. Requesting them by hand forces that work to
// happen behind the dots instead.
const FACES = ['600 88px "Geist Variable"', '400 16px "Inter Variable"', '400 17px "JetBrains Mono"'];

/** Hold behind the dots until the GL field has drawn a frame and the fonts are
 *  decoded - with a ceiling, so neither can keep the page hostage. */
function whenReady(run: () => void): void {
  let started = false;
  const go = () => {
    if (started) return;
    started = true;
    const dots = document.getElementById("preload");
    dots?.classList.add("gone");
    setTimeout(() => dots?.remove(), 500);
    run();
  };
  const bg = new Promise<void>((res) => bus.on("bgready", () => res()));
  const fonts = document.fonts
    ? Promise.all(FACES.map((f) => document.fonts.load(f).catch(() => {}))).then(() => document.fonts.ready)
    : Promise.resolve();
  Promise.all([bg, fonts]).then(go);
  setTimeout(go, 3000);
}

export function initBoot(): void {
  whenReady(runBoot);
}

function runBoot(): void {
  const frame = document.getElementById("frame")!;
  const nameEl = document.getElementById("name")!;
  const askbar = document.getElementById("askbar")!;
  const dock = document.getElementById("dock")!;
  const credit = document.querySelector<HTMLElement>(".credit")!;

  // the identity stack's text is prerendered into index.html; boot only reveals it
  const ident = document.querySelectorAll<HTMLElement>("#ident p");

  if (reduce) {
    nameEl.textContent = content.name;
    [frame, askbar, dock, credit, ...ident].forEach((el) => (el.style.opacity = "1"));
    frame.classList.add("booted");
    return;
  }

  // per-letter spans so the name can sharpen with a stagger
  nameEl.innerHTML = content.name
    .split("")
    .map((c) => `<span class="ch">${c === " " ? "&nbsp;" : c}</span>`)
    .join("");
  const letters = nameEl.querySelectorAll(".ch");

  // one-shot border light - lives in #stage (not the frame) so it can draw
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

  // t0 for everything else that has to land on this timeline (the chip row)
  bus.emit("boot");

  // Everything here animates opacity/transform only. `filter: blur()` on the
  // letters re-rasterized 11 text layers per frame while the backdrop-filter
  // was already resampling the whole frame - that pair was the boot stutter.
  // Scale + lift reads as the same "condensing out of the smoke" for free.
  createTimeline({ defaults: { ease: "outCubic" }, playbackRate: 1.05 })
    .add(line, { draw: ["0 0", "0 1"], duration: 1500, ease: "inOutCubic" }, 150)
    .add(
      frame,
      {
        opacity: [0, 1],
        duration: 1000,
        ease: "outQuad",
        onComplete: () => frame.classList.add("booted"), // hand off to the resting border glow
      },
      1650,
    )
    .add(lineSvg, { opacity: [1, 0], duration: 500, ease: "outQuad", onComplete: () => lineSvg.remove() }, 1800)
    .add(
      letters,
      {
        opacity: [0, 1],
        scale: [0.9, 1],
        translateY: [6, 0],
        duration: 600,
        delay: stagger(22),
      },
      2150,
    )
    // On the timeline at an absolute time rather than hung off the letters'
    // onComplete: one oversized rAF tick (a backgrounded tab) skips a child
    // callback, and the positioning line is the last thing that may go missing.
    .add(ident, { opacity: [0, 1], translateY: [7, 0], duration: 620, delay: stagger(110) }, 2500)
    // opacity only - both are centered by their own transform, which an
    // anime.js translate would overwrite and never give back
    .add(askbar, { opacity: [0, 1], duration: 500 }, 2800)
    .add(dock, { opacity: [0, 1], duration: 500 }, 3000)
    .add(credit, { opacity: [0, 1], duration: 400, ease: "outQuad" }, 3150);
}
