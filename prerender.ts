import content from "./src/content.json" with { type: "json" };

/**
 * Build-time prerender. The interactive site is a WebGL canvas plus a few
 * hundred bytes of DOM, which is a fine experience and a terrible document: a
 * crawler, a screen reader, or anyone with JS off sees an empty input box.
 *
 * So the same content that content.json feeds the interactive UI is also
 * written into index.html as plain semantic HTML at build time. Sighted JS
 * visitors never see it (clipped, but left in the accessibility tree); no-JS
 * visitors get the whole portfolio as an ordinary scrollable page.
 *
 * Three markers in index.html are replaced: @meta, @hero, @static.
 */

type Dict = Record<string, unknown>;

const esc = (s: unknown): string =>
  String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

const ul = (items: unknown[]): string => `<ul>${items.map((i) => `<li>${esc(i)}</li>`).join("")}</ul>`;

const c = content as unknown as Dict & {
  name: string;
  siteUrl: string;
  role: string;
  credentials: string;
  focus: string;
  about: { bio: string; facts: string[]; proof: string[] };
  projects: {
    id: string;
    title: string;
    blurb: string;
    details: string;
    stack: string[];
    claims: { status: string; text: string }[];
    links: Record<string, string>;
  }[];
  skills: { group: string; items: string[] }[];
  experience: { role: string; org: string; period: string; location?: string; summary: string; points: string[] }[];
  achievements: { title: string; detail: string }[];
  education: { school: string; degree: string; period: string };
  contact: { email: string; github: string; linkedin: string };
  resumeUrl: string;
};

// `role` is optional. Left empty it used to render a dangling separator into the
// tab title ("Varun Singh - "), a stray comma into the meta description, and an
// empty <p> into the hero, so every consumer of it degrades on its own here.
const role = c.role.trim();
const title = role ? `${c.name} \u00b7 ${role}` : c.name;
const description = `${c.name}${role ? `, ${role}` : ""}. ${c.credentials}. ${c.about.proof[0]}. ${c.about.proof[1]}.`;

function meta(): string {
  const person = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: c.name,
    ...(role ? { jobTitle: role } : {}),
    description: c.about.bio,
    url: c.siteUrl,
    email: `mailto:${c.contact.email}`,
    sameAs: [c.contact.github, c.contact.linkedin],
    worksFor: { "@type": "Organization", name: c.experience[0].org },
    alumniOf: { "@type": "CollegeOrUniversity", name: c.education.school },
    knowsAbout: c.skills.flatMap((g) => g.items),
  };
  return [
    `<title>${esc(title)}</title>`,
    `<link rel="canonical" href="${esc(c.siteUrl)}/" />`,
    `<meta name="description" content="${esc(description)}" />`,
    `<meta name="author" content="${esc(c.name)}" />`,
    `<meta property="og:type" content="profile" />`,
    `<meta property="og:title" content="${esc(title)}" />`,
    `<meta property="og:description" content="${esc(description)}" />`,
    `<meta property="og:url" content="${esc(c.siteUrl)}/" />`,
    `<meta name="twitter:card" content="summary" />`,
    `<meta name="twitter:title" content="${esc(title)}" />`,
    `<meta name="twitter:description" content="${esc(description)}" />`,
    `<meta name="theme-color" content="#050507" />`,
    `<script type="application/ld+json">${JSON.stringify(person).replace(/</g, "\\u003c")}</script>`,
  ].join("\n    ");
}

/** The hero text lives here rather than in hero.ts so it is in the served HTML,
 *  not painted in after the bundle loads. hero.ts only reveals it. */
function hero(): string {
  return (
    `<h1><span id="name">${esc(c.name)}</span></h1>\n` +
    `        <span class="esc-hint">esc</span>\n` +
    `        <div class="ident" id="ident">\n` +
    (role ? `          <p class="ident-role">${esc(role)}</p>\n` : "") +
    `          <p class="ident-cred">${esc(c.credentials)}</p>\n` +
    `          <p class="ident-focus">${esc(c.focus)}</p>\n` +
    `        </div>`
  );
}

function statics(): string {
  const s: string[] = [];
  s.push(`<main id="static">`);
  s.push(`<header><h1>${esc(c.name)}</h1>`);
  s.push(`<p class="s-role">${esc(c.role)}</p>`);
  s.push(`<p class="s-cred">${esc(c.credentials)} · ${esc(c.focus)}</p></header>`);

  s.push(`<section><h2>About</h2><p>${esc(c.about.bio)}</p>`);
  s.push(`<p>${c.about.facts.map(esc).join(" · ")}</p>`);
  s.push(`<h3>Selected results</h3>${ul(c.about.proof)}</section>`);

  s.push(`<section><h2>Experience</h2>`);
  for (const e of c.experience) {
    s.push(`<article><h3>${esc(e.role)} - ${esc(e.org)}</h3>`);
    s.push(`<p class="s-when">${esc(e.period)}${e.location ? ` · ${esc(e.location)}` : ""}</p>`);
    s.push(`<p>${esc(e.summary)}</p>${ul(e.points)}</article>`);
  }
  s.push(`</section>`);

  s.push(`<section><h2>Projects</h2>`);
  for (const p of c.projects) {
    s.push(`<article><h3>${esc(p.title)}</h3><p class="s-when">${esc(p.blurb)}</p>`);
    s.push(`<p>${esc(p.details)}</p>`);
    s.push(`<p>Stack: ${p.stack.map(esc).join(", ")}</p>`);
    // status-tagged, because "planned" and "benchmarked" are not the same claim
    s.push(
      `<ul>${p.claims
        .map((cl) => `<li><b>${esc(cl.status)}</b> - ${esc(cl.text)}</li>`)
        .join("")}</ul>`,
    );
    const links = Object.entries(p.links).map(
      ([k, v]) => `<a href="${esc(v)}" rel="noopener">${esc(k)}</a>`,
    );
    if (links.length) s.push(`<p>${links.join(" · ")}</p>`);
    s.push(`</article>`);
  }
  s.push(`</section>`);

  s.push(`<section><h2>Skills</h2>`);
  for (const g of c.skills) s.push(`<h3>${esc(g.group)}</h3><p>${g.items.map(esc).join(" · ")}</p>`);
  s.push(`</section>`);

  s.push(`<section><h2>Achievements</h2>`);
  s.push(ul(c.achievements.map((a) => `${a.title} - ${a.detail}`)));
  s.push(`</section>`);

  s.push(
    `<section><h2>Education</h2><p>${esc(c.education.school)} - ${esc(c.education.degree)}, ` +
      `${esc(c.education.period)}</p></section>`,
  );

  s.push(`<section><h2>Contact</h2><ul>`);
  s.push(`<li><a href="mailto:${esc(c.contact.email)}">${esc(c.contact.email)}</a></li>`);
  s.push(`<li><a href="${esc(c.contact.github)}" rel="noopener">GitHub</a></li>`);
  s.push(`<li><a href="${esc(c.contact.linkedin)}" rel="noopener">LinkedIn</a></li>`);
  s.push(`<li><a href="${esc(c.resumeUrl)}">Résumé (PDF)</a></li>`);
  s.push(`</ul></section></main>`);
  return s.join("\n");
}

export function prerender() {
  return {
    name: "portfolio-prerender",
    // runs in dev and build, so there is one source of truth for this text
    transformIndexHtml(html: string): string {
      return html
        .replace("<!--@meta-->", meta())
        .replace("<!--@hero-->", hero())
        .replace("<!--@static-->", statics());
    },
  };
}
