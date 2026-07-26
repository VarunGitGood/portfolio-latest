/** Stream an answer from the /ask worker, token by token. */
export class AskError extends Error {
  constructor(public kind: "limit" | "unavailable") {
    super(kind);
  }
}

export async function ask(question: string, onToken: (t: string) => void): Promise<void> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000); // don't leave the visitor hanging
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
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    onToken(dec.decode(value, { stream: true }));
  }
}
