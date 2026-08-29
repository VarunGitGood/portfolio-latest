import { animate, stagger } from "animejs";
import { bus } from "../bus";
import { content, type Project } from "../data";

// The stream: one scroll surface for everything. Sections and chat answers
// append here as entries; the frame "docks" (hero shrinks to a header, askbar
// glides down) whenever the stream is in use.

export type Section = "about" | "projects" | "skills" | "experience" | "contact";

const TITLES: Record<Section, string> = {
  about: "About",
  projects: "Projects",
  skills: "Skills",
  experience: "Experience",
  contact: "Contact",
};
const TAGS: Record<Section, string> = {
  about: "whoami",
  projects: "ls ./work",
  skills: "cat skills",
  experience: "git log",
  contact: "ping varun",
};

const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
const frame = () => document.getElementById("frame")!;
const streamEl = () => document.getElementById("stream")!;

/** Glide the stream to its end instead of jumping. */
export function scrollToEnd(el: HTMLElement, smooth = true): void {
  if (reduce || !smooth) {
    el.scrollTop = el.scrollHeight;
    return;
  }
  animate(el, { scrollTop: el.scrollHeight - el.clientHeight, duration: 480, ease: "outCubic" });
}

let docked = false;

export function dockFrame(): void {
  if (docked) return;
  docked = true;
  frame().classList.add("docked");
  document.getElementById("hero")!.title = "back to start";
}

export function undockFrame(): void {
  if (!docked) return;
  docked = false;
  frame().classList.remove("docked");
  document.getElementById("hero")!.removeAttribute("title");
  bus.emit("section", null); // back on the landing - no tab is current
}

/** Hero click / esc return to the landing view; stream history is kept. */
export function initStream(): void {
  document.getElementById("hero")!.addEventListener("click", () => undockFrame());
  addEventListener("keydown", (e) => {
    if (e.key === "Escape") undockFrame();
  });
}

function bodyFor(sec: Section): string {
  switch (sec) {
    case "about":
      return `<p>${content.about.bio}</p>
        <ul class="proof">${content.about.proof.map((p) => `<li>${p}</li>`).join("")}</ul>
        <div class="facts">${content.about.facts.map((f) => `<span>${f}</span>`).join("")}</div>`;
    case "projects":
      return content.projects
        .map(
          (p) => `<div class="proj" data-id="${p.id}"><div class="pico">${p.title[0].toUpperCase()}</div>
          <div class="pt"><b>${p.title}</b><small>${p.blurb}</small></div>
          <span class="badge">${p.stack.join(", ")}</span><span class="chev">▸</span>
          <div class="pdetail"><div><p>${p.details}</p></div></div></div>`,
        )
        .join("");
    case "skills":
      // no proficiency bars: "Go 88%" has no definition anyone can check
      return content.skills
        .map(
          (g) => `<div class="skgroup"><h4>${g.group}</h4><div class="chips">${g.items
            .map((n) => `<span class="chip">${n}</span>`)
            .join("")}</div></div>`,
        )
        .join("");
    case "experience": {
      const journey = `<div class="journey">${content.experience
        .map(
          (e) =>
            `<div class="exp"><span class="per">${e.period}</span><b>${e.role}</b> · <span class="org">${e.org}</span>
            <p>${e.summary}</p><ul class="pts">${e.points.map((p) => `<li>${p}</li>`).join("")}</ul></div>`,
        )
        .join("")}</div>`;
      const extras = `<div class="skgroup"><h4>Achievements</h4><ul class="proof">${content.achievements
        .map((a) => `<li><b>${a.title}</b> - ${a.detail}</li>`)
        .join("")}</ul></div>
        <div class="skgroup"><h4>Education</h4><p>${content.education.school} - ${content.education.degree}, ${content.education.period}</p></div>`;
      return journey + extras;
    }
    case "contact":
      return `<div class="ping"></div>
        <div class="contact-links">
          <a href="mailto:${content.contact.email}">mailto ↗</a>
          <a href="${content.contact.github}" target="_blank" rel="noopener">github ↗</a>
          <a href="${content.contact.linkedin}" target="_blank" rel="noopener">linkedin ↗</a>
        </div>`;
  }
}

/** Fast typewriter for the command tag (~150ms total). */
function typeTag(el: Element, text: string, done: () => void): void {
  const speed = Math.max(8, Math.floor(150 / text.length));
  let i = 0;
  (function step() {
    if (i <= text.length) {
      el.textContent = text.slice(0, i++);
      setTimeout(step, speed);
    } else done();
  })();
}

/** `focusId` expands that project row once the section renders - the assistant
 *  uses it to point at a specific project while it answers. */
export function openSection(sec: Section, focusId?: string): void {
  dockFrame();
  bus.emit("section", sec);
  const s = streamEl();

  // re-clicking the section that's already last just pulses it - no dupes
  const last = s.lastElementChild as HTMLElement | null;
  if (last?.dataset.sec === sec) {
    if (!reduce) animate(last, { scale: [1, 1.015, 1], duration: 320, ease: "inOutQuad" });
    if (focusId) expandProject(last, focusId);
    scrollToEnd(s);
    return;
  }

  const entry = document.createElement("div");
  entry.className = "entry";
  entry.dataset.sec = sec;
  entry.innerHTML = `<div class="ehead"><h3>${TITLES[sec]}</h3><span class="etag"></span></div><div class="ebody"></div>`;
  s.appendChild(entry);
  if (!reduce) animate(entry, { opacity: [0, 1], translateY: [14, 0], duration: 420, ease: "outCubic" });
  scrollToEnd(s);

  const body = entry.querySelector(".ebody") as HTMLElement;
  const fill = () => {
    body.innerHTML = bodyFor(sec);
    wire(sec, entry);
    if (!reduce) {
      if (sec === "experience") {
        // cards drop in from above, top of the journey first, as the line draws down
        animate(body.querySelectorAll(".exp"), {
          opacity: [0, 1],
          translateY: [-18, 0],
          delay: stagger(200),
          duration: 700,
          ease: "outCubic",
        });
      } else {
        const targets = body.querySelectorAll(".proj, .skgroup, p, .facts span, .ping, .contact-links");
        animate(targets, { opacity: [0, 1], translateY: [8, 0], delay: stagger(30), duration: 340, ease: "outQuad" });
      }
    }
    if (focusId) expandProject(entry, focusId);
    scrollToEnd(s);
  };
  const tag = entry.querySelector(".etag")!;
  if (reduce) {
    tag.textContent = TAGS[sec];
    fill();
  } else typeTag(tag, TAGS[sec], fill);

  // reactions into the background
  if (sec === "contact") bus.emit("ping");
  else bus.emit("react", sec);
}

/** Accordion: only one project row is open at a time. */
function expandProject(entry: HTMLElement, id: string): void {
  const el = entry.querySelector<HTMLElement>(`.proj[data-id="${id}"]`);
  if (!el || el.classList.contains("open")) return;
  entry.querySelectorAll(".proj.open").forEach((o) => o.classList.remove("open"));
  el.classList.add("open");
  const p = content.projects.find((x) => x.id === id) as Project;
  bus.emit("converge", p?.region);
}

function wire(sec: Section, entry: HTMLElement): void {
  if (sec === "projects") {
    entry.querySelectorAll<HTMLElement>(".proj").forEach((el) => {
      el.onclick = () => {
        if (el.classList.contains("open")) el.classList.remove("open");
        else expandProject(entry, el.dataset.id!);
      };
    });
  } else if (sec === "contact") {
    runPing(entry);
  }
}

function runPing(entry: HTMLElement): void {
  const out = entry.querySelector(".ping");
  if (!out) return;
  const lines: [string, number][] = [
    [`<span class="cmd">$ ping ${content.name.split(" ")[0].toLowerCase()}</span>`, 150],
    ['<span class="ok">reachable</span> - opening channel…', 450],
  ];
  out.innerHTML = "";
  // entry keeps growing after the initial scroll - follow it down as lines land
  lines.forEach(([t, d]) =>
    setTimeout(() => {
      out.innerHTML += t + "<br>";
      scrollToEnd(streamEl());
    }, reduce ? 0 : d),
  );
  setTimeout(() => {
    entry.querySelector(".contact-links")?.classList.add("on");
    scrollToEnd(streamEl());
  }, reduce ? 0 : 800);
}
