import { content } from "../data";

const TAGS = content.taglines.map((t) => "> " + t);

function typewriter(el: HTMLElement, text: string, speed: number, cb?: () => void) {
  let i = 0;
  el.textContent = "";
  (function step() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i++);
      setTimeout(step, speed);
    } else cb?.();
  })();
}

/** Reserve the width of the *widest* tagline, once, so the left edge is the
 *  same for every line and typing never recenters. The type shrinks to fit
 *  rather than wrapping — a wrapped tagline sits crooked under the big name. */
function fitTagline(el: HTMLElement): void {
  const avail = (el.parentElement as HTMLElement).clientWidth;
  const keep = el.textContent;
  el.style.width = "";
  el.style.fontSize = "";
  el.style.maxWidth = "none"; // measure the true single-line width, uncapped
  let max = 0;
  for (const t of TAGS) {
    el.textContent = t;
    max = Math.max(max, el.offsetWidth);
  }
  if (max > avail) {
    el.style.fontSize = parseFloat(getComputedStyle(el).fontSize) * (avail / max) + "px";
    max = avail;
  }
  el.style.maxWidth = "";
  el.style.width = max + "px";
  el.textContent = keep;
}

/** Kicks off once the boot timeline has materialized the name. */
export function startTaglines(): void {
  const el = document.getElementById("tag")!;
  fitTagline(el);
  document.fonts?.ready.then(() => fitTagline(el)); // mono metrics decide the width

  let t: number | undefined;
  addEventListener("resize", () => {
    clearTimeout(t);
    t = setTimeout(() => fitTagline(el), 150);
  });

  let k = 0;
  (function run() {
    typewriter(el, TAGS[k], 38, () =>
      setTimeout(() => {
        k = (k + 1) % TAGS.length;
        run();
      }, 2600),
    );
  })();
}
