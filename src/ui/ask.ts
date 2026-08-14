export class AskError extends Error {
  constructor(public kind: "limit" | "unavailable") {
    super(kind);
  }
}

export interface AskHandlers {
  /** a chunk of the answer */
  token: (t: string) => void;
  /** a line for the thinking trace ("reading github.com/… readme") */
  trace: (m: string) => void;
  /** the assistant driving the page */
  action: (name: string, args: Record<string, string>) => void;
}

/** POST /ask streams newline-delimited JSON events; chunks split mid-line, so
 *  the tail is carried over until its newline arrives. */
export async function ask(question: string, on: AskHandlers): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
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
    let e: { t: string; d?: string; m?: string; name?: string; args?: Record<string, string> };
    try {
      e = JSON.parse(line);
    } catch {
      return; // a truncated final line — nothing useful left in it
    }
    if (e.t === "tok" && e.d) on.token(e.d);
    else if (e.t === "trace" && e.m) on.trace(e.m);
    else if (e.t === "action" && e.name) on.action(e.name, e.args ?? {});
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
