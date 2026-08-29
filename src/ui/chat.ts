import { animate, stagger } from "animejs";
import { bus } from "../bus";
import { ask, askRemaining, AskError, type Cite, type StepEvent } from "./ask";
import { dockFrame, scrollToEnd } from "./stream";
import { measureCluster } from "./dock";
import { runAction } from "./actions";
import { content } from "../data";

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

// MOCK: while true, don't hit the worker - fake a ~2s "thinking" then stream a
// stub answer, so the converge→dissipate bg effect can be tested standalone.
// Set to false once the /ask worker + OPENROUTER_API_KEY are live.
const MOCK = false;

// client-side display of the server's 5/day limit (server is authoritative)
const LIMIT = 5;
const used = () => Number(localStorage.getItem("ask_used") || "0");
const bump = () => localStorage.setItem("ask_used", String(used() + 1));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

// The model writes light markdown. Escape first, then re-introduce only the
// marks it actually uses - anything else would show up as literal asterisks to
// a recruiter. `.msg-a` is pre-wrap, so newlines need no work.
//
// Fenced blocks matter now that the assistant can read source files: it quotes
// code, and that has to look like code. They're lifted out before escaping so
// the inline rules never run inside a block, then put back as <pre>.
const md = (s: string) => {
  // mid-stream the closing fence hasn't arrived yet - close it so the block
  // renders as it types instead of showing three backticks and raw code
  const whole = (s.match(/```/g)?.length ?? 0) % 2 ? s + "\n```" : s;
  const blocks: string[] = [];
  const body = whole.replace(/\n*```[a-z]*\n?([\s\S]*?)```\n*/gi, (_m, code: string) => {
    blocks.push(code.replace(/\n+$/, ""));
    return `\u0000${blocks.length - 1}\u0000`;
  });
  return esc(body)
    .replace(/\*\*([^*\n]+)\*\*/g, "<b>$1</b>")
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/^[ \t]*[-*]\s+/gm, "• ")
    .replace(/\u0000(\d+)\u0000/g, (_m, i: string) => `<pre class="msg-pre"><code>${esc(blocks[+i])}</code></pre>`);
};

// The model ends each answer with "sources: a, b" - render that as a ✓-checked
// footer so answers visibly cite the docs. When tools actually ran we have the
// verified evidence row instead, and that wins: the model's own list is prose,
// and prose can be padded with sections it never opened.
// The worker checks quoted code against the bytes it actually fetched. When a
// block does not match, it is dropped rather than flagged: invented code under a
// real GitHub permalink is exactly the impression this assistant must never give.
const stripCode = (s: string, bad: number[]) => {
  let i = -1;
  return s.replace(/\n*```[a-z]*\n?[\s\S]*?```\n*/gi, (block) => {
    i++;
    return bad.includes(i)
      ? "\n\n[code omitted - it did not match the file that was read. The source link below is the real thing.]\n\n"
      : block;
  });
};

function renderAnswer(text: string, cites: Cite[], unverified: number[]): string {
  const raw = unverified.length ? stripCode(text, unverified) : text;
  const m = raw.match(/(?:\n\s*|\s+)sources:\s*(.+?)\s*$/i);
  const body = md((m ? raw.slice(0, m.index) : raw).trimEnd());
  if (cites.length) return body + renderCites(cites);
  if (!m) return body;
  const items = m[1].split(",").map((x) => `✓ ${esc(x.trim())}`);
  return `${body}<span class="msg-src">${items.join("&ensp;")}</span>`;
}

// What the answer was actually allowed to read, as links the visitor can open.
// The model's own "sources:" line is prose; this row is the fetch log.
function renderCites(items: Cite[]): string {
  if (!items.length) return "";
  const links = items
    .map((i) => `<a href="${esc(i.url)}" target="_blank" rel="noopener">${esc(i.label)}</a>`)
    .join("");
  return `<div class="msg-ev"><span class="msg-ev-h">evidence</span>${links}</div>`;
}

function mockAnswer(q: string, onToken: (t: string) => void): Promise<void> {
  const reply =
    `(mock) You asked: "${q}". The assistant isn't wired to OpenRouter yet - this is a placeholder so you can watch the smoke gather while "thinking" and dissipate when the answer lands.` +
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
  const say = document.getElementById("say")!; // screen-reader announcement, once per answer
  let busy = false;

  const remaining = () => Math.max(0, LIMIT - used());
  const refreshKbd = () => (kbd.textContent = Number.isFinite(LIMIT) ? `${remaining()} left` : "↵");

  // suggested questions - onboarding for visitors who don't know what to ask;
  // gone for good after the first real question
  const hideSugg = () => sugg.classList.add("gone");
  // the count belongs to the server, not the browser: clearing localStorage no
  // longer hands back a question, it just gets corrected on the next sync
  const syncRemaining = async () => {
    const n = await askRemaining();
    if (n === null) return;
    localStorage.setItem("ask_used", String(LIMIT - n));
    refreshKbd();
    if (n < LIMIT) hideSugg();
  };
  sugg.innerHTML = content.suggestedQuestions
    .map((s) => `<span class="sq" data-q="${esc(s.question)}">${esc(s.label)}</span>`)
    .join("");
  sugg.querySelectorAll<HTMLElement>(".sq").forEach((el) => {
    el.onclick = () => {
      input.value = el.dataset.q || "";
      submit();
    };
  });
  measureCluster(); // the chip row's real height is what positions the tabs
  if (used() > 0) hideSugg();
  // chips trickle in after the askbar lands - offset is measured from the boot
  // timeline's start, not page load, since boot waits on the GL field
  else if (!reduce) {
    const chips = sugg.querySelectorAll<HTMLElement>(".sq");
    chips.forEach((c) => (c.style.opacity = "0"));
    bus.on("boot", () =>
      animate(chips, {
        opacity: { to: [0, 1], duration: 380, ease: "outQuad" },
        // little dip down, then settle back up
        translateY: [
          { to: 8, duration: 260, ease: "outQuad" },
          { to: 0, duration: 340, ease: "outQuad" },
        ],
        delay: stagger(70, { start: 3290 }),
      }),
    );
  }

  function toast(msg: string) {
    const t = document.createElement("div");
    t.className = "toast";
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  // shake the input, not the bar - the bar's own transform does the centering
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
      toast("That's all 5 questions for today - come back tomorrow, or just email Varun.");
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
    row.innerHTML =
      `<div class="msg-q">${esc(q)}</div><div class="msg-trace"></div>` +
      `<div class="msg-a"><span class="blinkc">▌</span></div>`;
    convo.appendChild(row);
    if (!reduce) animate(row, { opacity: [0, 1], translateY: [12, 0], duration: 380, ease: "outCubic" });
    const a = row.querySelector(".msg-a") as HTMLElement;
    const trace = row.querySelector(".msg-trace") as HTMLElement;
    scrollToEnd(convo);

    bus.emit("thinking", true); // gather the smoke to center
    let text = "";
    let cites: Cite[] = [];
    let unverified: number[] = [];
    const onToken = (tok: string) => {
      // don't yank the view if the visitor scrolled up to read
      const follow = convo.scrollHeight - convo.scrollTop - convo.clientHeight < 80;
      text += tok;
      trace.classList.add("done"); // the answer is landing - the trace dims out of the way
      a.innerHTML = md(text) + '<span class="blinkc">▌</span>';
      if (follow) convo.scrollTop = convo.scrollHeight;
    };
    // the investigation thread: one node per fetch, resolved in place when it
    // lands, so the visitor watches the same work the model is waiting on
    const nodes = new Map<number, HTMLElement>();
    const onStep = (e: StepEvent) => {
      if (e.state === "head") {
        const head = document.createElement("div");
        head.className = "tl tl-head";
        head.textContent = e.m || "";
        trace.appendChild(head);
      } else if (e.state === "run") {
        const node = document.createElement("div");
        node.className = "tl tl-run";
        node.innerHTML = `<span class="tl-dot"></span><span class="tl-label"></span><span class="tl-meta"></span>`;
        node.querySelector(".tl-label")!.textContent = e.m || "";
        trace.appendChild(node);
        nodes.set(e.id, node);
        if (!reduce) animate(node, { opacity: [0, 1], translateX: [-6, 0], duration: 240, ease: "outQuad" });
      } else {
        const node = nodes.get(e.id);
        if (!node) return;
        node.classList.remove("tl-run");
        node.classList.add(e.state === "ok" ? "tl-ok" : "tl-fail");
        // sub-5ms is a client-side action, not a fetch - no timing worth showing
        const bits = [e.detail, e.ms != null && e.ms >= 5 ? `${e.ms}ms` : ""].filter(Boolean);
        node.querySelector(".tl-meta")!.textContent = bits.join(" · ");
      }
      scrollToEnd(convo);
    };
    // a tool-calling round can leak a sentence of preamble before its calls; the
    // worker says when that happened and the real answer starts over
    const onReset = () => {
      text = "";
      a.innerHTML = '<span class="blinkc">▌</span>';
    };
    try {
      await (MOCK
        ? mockAnswer(q, onToken)
        : ask(q, {
            token: onToken,
            step: onStep,
            action: runAction,
            reset: onReset,
            cite: (items) => (cites = items),
            unverified: (blocks) => (unverified = blocks),
          }));
      a.innerHTML = renderAnswer(text, cites, unverified);
      say.textContent = text;
      bump();
    } catch (e) {
      if (e instanceof AskError && e.kind === "limit") {
        localStorage.setItem("ask_used", String(LIMIT)); // sync display with server
        a.innerHTML = `<span class="msg-err">that's all 5 questions for today - <a href="mailto:${content.contact.email}">email Varun</a> instead.</span>`;
      } else {
        a.innerHTML = `<span class="msg-err">the assistant is napping - <a href="mailto:${content.contact.email}">email Varun</a> instead.</span>`;
      }
      say.textContent = a.textContent;
    } finally {
      bus.emit("thinking", false); // release / dissipate
      busy = false;
      askbar.classList.remove("busy");
      input.disabled = false;
      input.focus();
      refreshKbd();
      void syncRemaining();
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
  void syncRemaining();
}
