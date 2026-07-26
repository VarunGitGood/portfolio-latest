import { content } from "../data";

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

/** Kicks off once the boot timeline has materialized the name. */
export function startTaglines(): void {
  const el = document.getElementById("tag")!;
  el.style.textAlign = "left"; // width is reserved up front — no recentering wobble while typing
  let k = 0;
  (function run() {
    const text = "> " + content.taglines[k];
    el.textContent = text; // measure full width before typing (no paint between)
    el.style.width = el.offsetWidth + "px";
    typewriter(el, text, 38, () =>
      setTimeout(() => {
        k = (k + 1) % content.taglines.length;
        run();
      }, 2600),
    );
  })();
}
