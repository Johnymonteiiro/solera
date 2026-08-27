import { MemorySaver } from "@langchain/langgraph";
import type { RunnableConfig } from "@langchain/core/runnables";
import fs from "node:fs";
import path from "node:path";

// Checkpointer persistente em disco, sem dependência nativa (evita better-sqlite3
// no Windows). Estende o MemorySaver — que já guarda tudo em `this.storage` e
// `this.writes` — e apenas espelha essas estruturas num JSON, hidratando na
// construção. Assim os artefatos de cada agente (research, insights, draft,
// judgement, humanFeedback, finalPostUrl) sobrevivem a restart do servidor.
//
// Os valores internos do MemorySaver são bytes serializados (Uint8Array). O
// encode/decode abaixo percorre a estrutura e converte esses bytes ↔ base64,
// preservando também `undefined` (que JSON viraria null e quebraria o parentId).

const STORE_PATH = path.join(process.cwd(), "data", "checkpoints.json");

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function encode(v: any): any {
  if (v === undefined) return { __undef: true };
  if (v instanceof Uint8Array) return { __u8: Buffer.from(v).toString("base64") };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === "object") {
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) o[k] = encode(v[k]);
    return o;
  }
  return v;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decode(v: any): any {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    if (v.__undef === true) return undefined;
    if (typeof v.__u8 === "string") return new Uint8Array(Buffer.from(v.__u8, "base64"));
    const o: Record<string, unknown> = {};
    for (const k of Object.keys(v)) o[k] = decode(v[k]);
    return o;
  }
  if (Array.isArray(v)) return v.map(decode);
  return v;
}

class FileCheckpointSaver extends MemorySaver {
  private persistTimer: NodeJS.Timeout | null = null;

  constructor() {
    super();
    this.hydrate();
  }

  private hydrate(): void {
    try {
      const raw = fs.readFileSync(STORE_PATH, "utf8");
      const data = JSON.parse(raw);
      this.storage = decode(data.storage ?? {});
      this.writes = decode(data.writes ?? {});
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== "ENOENT") {
        console.error("[checkpointer] falha ao hidratar de", STORE_PATH, err);
      }
    }
  }

  // Debounce: put/putWrites disparam várias vezes por nó — coalesce a escrita.
  private schedulePersist(): void {
    if (this.persistTimer) return;
    this.persistTimer = setTimeout(() => {
      this.persistTimer = null;
      const snapshot = JSON.stringify({
        storage: encode(this.storage),
        writes: encode(this.writes),
      });
      fs.mkdir(path.dirname(STORE_PATH), { recursive: true }, () => {
        fs.writeFile(STORE_PATH, snapshot, (err) => {
          if (err) console.error("[checkpointer] falha ao persistir:", err);
        });
      });
    }, 200);
  }

  async put(
    ...args: Parameters<MemorySaver["put"]>
  ): Promise<RunnableConfig> {
    const result = await super.put(...args);
    this.schedulePersist();
    return result;
  }

  async putWrites(...args: Parameters<MemorySaver["putWrites"]>): Promise<void> {
    await super.putWrites(...args);
    this.schedulePersist();
  }

  async deleteThread(threadId: string): Promise<void> {
    await super.deleteThread(threadId);
    this.schedulePersist();
  }

  // Flush síncrono imediato — chamado em pontos terminais (fim de run/review)
  // para não perder o último checkpoint na janela do debounce de 200ms.
  flushNow(): void {
    if (this.persistTimer) {
      clearTimeout(this.persistTimer);
      this.persistTimer = null;
    }
    try {
      const snapshot = JSON.stringify({
        storage: encode(this.storage),
        writes: encode(this.writes),
      });
      fs.mkdirSync(path.dirname(STORE_PATH), { recursive: true });
      fs.writeFileSync(STORE_PATH, snapshot);
    } catch (err) {
      console.error("[checkpointer] flush síncrono falhou:", err);
    }
  }
}

// globalThis garante que o singleton sobrevive ao isolamento de módulos
// do Next.js App Router entre diferentes Route Handlers.
declare global {
  // eslint-disable-next-line no-var
  var __checkpointer: FileCheckpointSaver | undefined;
}

export function getCheckpointer(): FileCheckpointSaver {
  if (!globalThis.__checkpointer) {
    globalThis.__checkpointer = new FileCheckpointSaver();
  }
  return globalThis.__checkpointer;
}

// Persiste o checkpoint imediatamente (síncrono). Chamar ao fim de um run/review.
export function flushCheckpointer(): void {
  globalThis.__checkpointer?.flushNow();
}

// Remove o checkpoint de um thread (usado ao deletar um post).
export async function deleteCheckpoint(threadId: string): Promise<void> {
  await globalThis.__checkpointer?.deleteThread(threadId);
}
