import { MemorySaver } from "@langchain/langgraph";

// globalThis garante que o singleton sobrevive ao isolamento de módulos
// do Next.js App Router entre diferentes Route Handlers.
declare global {
  // eslint-disable-next-line no-var
  var __checkpointer: MemorySaver | undefined;
}

export function getCheckpointer(): MemorySaver {
  if (!globalThis.__checkpointer) {
    globalThis.__checkpointer = new MemorySaver();
  }
  return globalThis.__checkpointer;
}
