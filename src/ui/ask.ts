export class AskError extends Error {
  constructor(public kind: "limit" | "unavailable") {
    super(kind);
  }
}

/** One node in the investigation thread. `head` opens a group, `run` is in
 *  flight, `ok`/`fail` resolve an earlier node by id. */
export interface StepEvent {
  id: number;
  m?: string;
  state: "head" | "run" | "ok" | "fail";
  detail?: string;
  ms?: number;
}

/** A link to something the answer was actually allowed to read. */
export interface Cite {
  label: string;
  url: string;
}

export interface AskHandlers {
  /** a chunk of the answer */
  token: (t: string) => void;
  /** a node in the investigation thread */
  step: (e: StepEvent) => void;
  /** the assistant driving the page */
  action: (name: string, args: Record<string, string>) => void;
  /** a tool round ended - drop whatever preamble it streamed, the answer follows */
  reset: () => void;
  /** the evidence the answer rests on */
  cite: (items: Cite[]) => void;
  /** indexes of fenced blocks that did not match the file they were read from */
  unverified: (blocks: number[]) => void;
}

/** POST /ask streams newline-delimited JSON events; chunks split mid-line, so
 *  the tail is carried over until its newline arrives. */
export async function ask(question: string, on: AskHandlers): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 35000); // up to three upstream calls now
  let res: Response;
  try {
    res = await fetch("/ask", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ question }),
      signal: ctrl.signal,
    });
  } catch {
    throw new AskError("unavailable");
  } finally {
    clearTimeout(timer);
  }
  if (res.status === 429) throw new AskError("limit");
  if (!res.ok || !res.body) throw new AskError("unavailable");

  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  const handle = (line: string) => {
    if (!line.trim()) return;
    let e: {
      t: string;
      d?: string;
      m?: string;
      name?: string;
      args?: Record<string, string>;
      id?: number;
      state?: StepEvent["state"];
      detail?: string;
      ms?: number;
      items?: Cite[];
      blocks?: number[];
    };
    try {
      e = JSON.parse(line);
    } catch {
      return; // a truncated final line - nothing useful left in it
    }
    if (e.t === "tok" && e.d) on.token(e.d);
    else if (e.t === "step" && e.state)
      on.step({ id: e.id ?? 0, m: e.m, state: e.state, detail: e.detail, ms: e.ms });
    else if (e.t === "action" && e.name) on.action(e.name, e.args ?? {});
    else if (e.t === "reset") on.reset();
    else if (e.t === "cite" && e.items?.length) on.cite(e.items);
    else if (e.t === "unverified") on.unverified(e.blocks ?? []);
    else if (e.t === "error") throw new AskError("unavailable");
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() || "";
    lines.forEach(handle);
  }
  handle(buf);
}
