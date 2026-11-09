import { getStore } from "@netlify/blobs";
let memory = null; // used by local tests
export function setMemoryStore(m) { memory = m; }
export function store() {
  if (memory) return memory;
  return getStore({ name: "book-cover-maker", consistency: "strong" });
}
