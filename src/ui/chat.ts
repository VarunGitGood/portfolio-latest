import { animate, stagger } from "animejs";
import { bus } from "../bus";
import { ask, AskError } from "./ask";
import { dockFrame, scrollToEnd } from "./stream";
import { content } from "../data";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// MOCK: while true, don't hit the worker — fake a ~2s "thinking" then stream a
// stub answer, so the converge→dissipate bg effect can be tested standalone.
// Set to false once the /ask worker + OPENROUTER_API_KEY are live.
const MOCK = true;

// client-side display of the server's 5/day limit (server is authoritative)
const LIMIT = 5;
const used = () => Number(localStorage.getItem("ask_used") || "0");
const bump = () => localStorage.setItem("ask_used", String(used() + 1));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The model ends each answer with "sources: a, b" — render that line as a
// ✓-checked footer instead of body text so answers visibly cite the docs.
function renderAnswer(text: string): string {
  const m = text.match(/\n\s*sources:\s*(.+)\s*$/i);
  if (!m) return esc(text);
  const body = text.slice(0, m.index);
  const items = m[1].split(",").map((s) => `✓ ${esc(s.trim())}`);
  return `${esc(body.trimEnd())}<span class="msg-src">${items.join("&ensp;")}</span>`;
}

function mockAnswer(q: string, onToken: (t: string) => void): Promise<void> {
  const reply =
    `(mock) You asked: "${q}". The assistant isn't wired to OpenRouter yet — this is a placeholder so you can watch the smoke gather while "thinking" and dissipate when the answer lands.` +
    `\nsources: orchestra › architecture, orchestra › trade-offs, resume`;
  return new Promise((resolve) => {
    setTimeout(() => {
      let i = 0;
      const id = setInterval(() => {
        onToken(reply.slice(i, i + 3));
        i += 3;
        if (i >= reply.length) {
          clearInterval(id);
          resolve();
        }
      }, 16);
    }, 2000); // 2s "thinking" window
  });
}

export function initChat(): void {
  const input = document.getElementById("ask") as HTMLInputElement;
  const convo = document.getElementById("stream")!;
  const kbd = document.getElementById("askKbd")!;
  const sugg = document.getElementById("sugg")!;
  const askbar = document.getElementById("askbar")!;
  let busy = false;

  const remaining = () => Math.max(0, LIMIT - used());
  const refreshKbd = () => (kbd.textContent = Number.isFinite(LIMIT) ? `${remaining()} left` : "↵");

  // suggested questions — onboarding for visitors who don't know what to ask;
  // gone for good after the first real question
  const hideSugg = () => sugg.classList.add("gone");
  sugg.innerHTML = content.suggestedQuestions.map((q) => `<span class="sq">${esc(q)}</span>`).join("");
  sugg.querySelectorAll<HTMLElement>(".sq").forEach((el) => {
    el.onclick = () => {
      input.value = el.textContent || "";
      submit();
    };
  });
  if (used() > 0) hideSugg();
  // chips trickle in after the askbar lands (boot reveals it ~3.3s)
  else if (!reduce) {
    const chips = sugg.querySelectorAll<HTMLElement>(".sq");
    chips.forEach((c) => (c.style.opacity = "0"));
    animate(chips, {
      opacity: { to: [0, 1], duration: 380, ease: "outQuad" },
      // little dip down, then settle back up
      translateY: [
        { to: 8, duration: 260, ease: "outQuad" },
        { to: 0, duration: 340, ease: "outQuad" },
      ],
      delay: stagger(70, { start: 3290 }),
    });
  }

  function toast(msg: string) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // shake the input, not the bar — the bar's own transform does the centering
  function shake() {
    if (reduce) return;
    animate(input, { translateX: [0, -7, 6, -4, 2, 0], duration: 340, ease: "outQuad" });
  }

  async function submit() {
    const q = input.value.trim();
    if (busy) return;
    if (!q) {
      shake();
      return;
    }
    if (remaining() <= 0) {
      shake();
      toast("That's all 5 questions for today — come back tomorrow, or just email Varun.");
      return;
    }
    busy = true;
    input.value = "";
    input.disabled = true;
    askbar.classList.add("busy");
    hideSugg();
    dockFrame();

    const row = document.createElement("div");
    row.className = "msg";
    row.innerHTML = `<div class="msg-q">${esc(q)}</div><div class="msg-a"><span class="blinkc">▌</span></div>`;
    convo.appendChild(row);
    if (!reduce) animate(row, { opacity: [0, 1], translateY: [12, 0], duration: 380, ease: "outCubic" });
    const a = row.querySelector(".msg-a") as HTMLElement;
    scrollToEnd(convo);

    bus.emit("thinking", true); // gather the smoke to center
    let text = "";
    const onToken = (tok: string) => {
      // don't yank the view if the visitor scrolled up to read
      const follow = convo.scrollHeight - convo.scrollTop - convo.clientHeight < 80;
      text += tok;
      a.innerHTML = esc(text) + '<span class="blinkc">▌</span>';
      if (follow) convo.scrollTop = convo.scrollHeight;
    };
    try {
      await (MOCK ? mockAnswer(q, onToken) : ask(q, onToken));
      a.innerHTML = renderAnswer(text);
      bump();
    } catch (e) {
      if (e instanceof AskError && e.kind === "limit") {
        localStorage.setItem("ask_used", String(LIMIT)); // sync display with server
        a.innerHTML = `<span class="msg-err">that's all 5 questions for today — <a href="mailto:${content.contact.email}">email Varun</a> instead.</span>`;
      } else {
        a.innerHTML = `<span class="msg-err">the assistant is napping — <a href="mailto:${content.contact.email}">email Varun</a> instead.</span>`;
      }
    } finally {
      bus.emit("thinking", false); // release / dissipate
      busy = false;
      askbar.classList.remove("busy");
      input.disabled = false;
      input.focus();
      refreshKbd();
    }
  }

  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      submit();
    }
  });
  addEventListener("keydown", (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "k") {
      e.preventDefault();
      input.focus();
    }
  });
  refreshKbd();
}
