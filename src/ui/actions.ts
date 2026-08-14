import { content } from "../data";
import { openSection, type Section } from "./stream";

// The assistant's side of the page: everything it can actually do to the UI.
// Unknown names are ignored on purpose — the worker may learn new tools before
// a cached client does.

export function runAction(name: string, args: Record<string, string>): void {
  switch (name) {
    case "open_section":
      openSection(args.section as Section);
      break;
    case "open_project":
      openSection("projects", args.id);
      break;
    case "open_resume":
      window.open(content.resumeUrl, "_blank", "noopener");
      break;
    case "open_link": {
      const target =
        args.kind === "email"
          ? `mailto:${content.contact.email}`
          : args.kind === "linkedin"
            ? content.contact.linkedin
            : content.contact.github;
      window.open(target, "_blank", "noopener");
      break;
    }
  }
}
