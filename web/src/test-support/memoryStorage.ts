/** An in-memory `Storage` for tests, optionally one that throws on every call. */
export function memoryStorage(initial: Record<string, string> = {}, failing = false): Storage {
  const data = new Map(Object.entries(initial));
  const guard = () => {
    if (failing) throw new Error("storage is blocked");
  };
  return {
    get length() {
      return data.size;
    },
    clear: () => data.clear(),
    key: (index) => [...data.keys()][index] ?? null,
    getItem: (key) => (guard(), data.get(key) ?? null),
    setItem: (key, value) => (guard(), void data.set(key, value)),
    removeItem: (key) => void data.delete(key),
  };
}
