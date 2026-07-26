/**
 * Tiny pub/sub. UI emits reaction events; the background engine subscribes and
 * drives node waves. Kept intentionally minimal — no deps.
 */
type Handler = (payload?: unknown) => void;

const channels = new Map<string, Set<Handler>>();

export const bus = {
  on(event: string, fn: Handler): () => void {
    let set = channels.get(event);
    if (!set) channels.set(event, (set = new Set()));
    set.add(fn);
    return () => set!.delete(fn);
  },
  emit(event: string, payload?: unknown): void {
    channels.get(event)?.forEach((fn) => fn(payload));
  },
};
