// ─── Config em memória: pré-carregada no boot, revalidada em segundo plano ───
//
// O PROBLEMA QUE ISTO RESOLVE. Toda leitura de config batia no Postgres, que
// fica em outra região (~300ms de RTT por query, medido). Uma execução do grafo
// fazia ~10 dessas em série — e a pior era a chave do provedor de busca, relida
// A CADA chamada da ferramenta. O agente de pesquisa não conseguia pesquisar sem
// o banco responder, e quando o pooler demorava a devolver slot a execução
// travava em `researching`, sem erro e sem fim.
//
// A REGRA QUE CONTINUA VALENDO. O settingsStore recusava cache com um argumento
// correto: servir o valor do `.env` quando o banco tem outro produz config
// silenciosamente errada, e `judgeMeta.model` registraria um modelo que não foi
// o usado — isso já custou todas as notas do Judge uma vez. Aqui o valor do
// banco vence sempre que o banco responde. O `.env` só entra quando a config
// NUNCA pôde ser lida, e nesse caso o log grita.
//
// O CICLO DE VIDA, que é o ponto:
//   boot        → `preload()` (src/instrumentation.ts) carrega e AGUARDA.
//   quente      → devolve da memória, sem I/O.
//   vencido     → devolve da memória NA HORA e revalida em segundo plano.
//   nunca lido  → só aí uma leitura é aguardada no caminho da requisição.
//
// Ou seja: depois do boot, nenhuma requisição e nenhum nó do grafo espera o
// banco por config. Uma queda do Postgres deixa de parar o pipeline — ele segue
// com o último valor conhecido.

/** Idade a partir da qual o valor é revalidado — em segundo plano. */
export const CONFIG_TTL_MS = 30_000;

/**
 * Teto de UMA leitura de config.
 *
 * Bem abaixo do `statement_timeout` de 2min do servidor, de propósito: o alvo é
 * degradar rápido para o último valor conhecido, não descobrir dois minutos
 * depois com o pipeline parado. Também limita quanto o boot pode atrasar.
 */
export const CONFIG_READ_TIMEOUT_MS = 5_000;

/**
 * Teto do PRELOAD do boot, separado de propósito.
 *
 * Os 5s acima são o certo para uma requisição: tem gente esperando, e degradar
 * rápido é melhor que pendurar. O boot não tem ninguém esperando — e paga um
 * custo que a requisição não paga: abrir conexão nova pelo Supavisor custou
 * 2,5–3,3s medidos aqui, contra ~210ms de uma query em conexão quente. Com
 * quatro preloads em paralelo num pool frio, os quatro estouravam 5s JUNTOS e o
 * servidor subia com a config inteira vazia — que é o pior dos dois mundos,
 * porque aí toda requisição seguinte paga a leitura no caminho quente.
 */
export const CONFIG_PRELOAD_TIMEOUT_MS = 20_000;

export interface CachedReader<T> {
  /** Valor atual. Só espera I/O se nunca tiver sido carregado. */
  get(): Promise<T>;
  /** Carrega e AGUARDA. Para o boot — ver src/instrumentation.ts. */
  preload(): Promise<void>;
  /** Descarta o cache; a próxima leitura recarrega. Chamar após gravar. */
  invalidate(): void;
  /** Estado atual, para diagnóstico. */
  status(): { carregado: boolean; idadeMs: number | null };
}

export function cachedReader<T>(
  nome: string,
  carrega: () => Promise<T>,
  vazio: () => T,
): CachedReader<T> {
  let valor: T | undefined;
  let carregadoEm = 0;
  let emVoo: Promise<T> | undefined;

  /**
   * Limita quanto o CHAMADOR espera — não quanto a leitura dura.
   *
   * `Promise.race` não cancela o perdedor: estourado o teto, a query segue
   * viva e segue segurando a conexão até terminar. Isso é aceitável desde que
   * o resultado dela não seja desperdiçado — ver `recarrega`.
   */
  function comTimeout(leitura: Promise<T>, tetoMs: number): Promise<T> {
    let timer: NodeJS.Timeout | undefined;
    return Promise.race([
      leitura,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(`leitura de config "${nome}" passou de ${tetoMs}ms`),
            ),
          tetoMs,
        );
      }),
    ]).finally(() => {
      // Sem o clear, o timer segura o event loop e um script de CLI não encerra
      // sozinho mesmo depois de a leitura ter dado certo.
      if (timer) clearTimeout(timer);
    });
  }

  // Coalescência: várias chamadas durante uma leitura compartilham a promise.
  // Sem isso, cinco nós subindo juntos viram cinco queries idênticas.
  //
  // A GRAVAÇÃO NO CACHE PENDURA NA LEITURA CRUA, não na corrida com o timeout.
  // A diferença não é estilo — antes, uma leitura que passasse do teto e
  // terminasse logo depois tinha o resultado DESCARTADO, e a config ficava fria
  // para sempre. Fria, `get()` cai no ramo que espera; cada requisição abria
  // mais uma leitura órfã contra um pool de 5 conexões; o pool saturava e aí
  // TODAS passavam do teto. Um handshake lento no boot (2,5–3,3s pelo
  // Supavisor) virava falha permanente, com `CONNECTION_CLOSED` no fim.
  //
  // Como `emVoo` só é limpo quando a leitura crua termina, quem chegar durante
  // uma leitura estourada ESPERA A MESMA — não abre outra. É isso que impede a
  // debandada.
  function recarrega(tetoMs: number): Promise<T> {
    if (!emVoo) {
      const leitura = carrega()
        .then((v) => {
          valor = v;
          carregadoEm = Date.now();
          return v;
        })
        .finally(() => {
          emVoo = undefined;
        });
      // Handler obrigatório: quem pediu já pode ter desistido pelo timeout, e
      // promise rejeitada sem handler derruba o processo. Quem espera recebe a
      // rejeição pela `comTimeout` abaixo, que tem seu próprio caminho de erro.
      leitura.catch(() => {});
      emVoo = leitura;
    }
    return comTimeout(emVoo, tetoMs);
  }

  return {
    async get() {
      if (valor !== undefined) {
        if (Date.now() - carregadoEm >= CONFIG_TTL_MS) {
          // Revalida SEM esperar: o caminho quente não paga I/O. O catch é
          // obrigatório — promise rejeitada sem handler derruba o processo.
          void recarrega(CONFIG_READ_TIMEOUT_MS).catch((err) => {
            console.error(
              `[config] revalidação de "${nome}" falhou — seguindo com o valor em memória:`,
              err,
            );
          });
        }
        return valor;
      }
      // Cache frio: aqui sim vale esperar, porque não há alternativa correta.
      // Depois do preload no boot, este ramo não deveria ser alcançado.
      try {
        return await recarrega(CONFIG_READ_TIMEOUT_MS);
      } catch (err) {
        console.error(
          `[config] "${nome}" nunca pôde ser lida — caindo no .env/defaults:`,
          err,
        );
        return vazio();
      }
    },

    async preload() {
      try {
        await recarrega(CONFIG_PRELOAD_TIMEOUT_MS);
      } catch (err) {
        // Boot NÃO falha por causa disto. O servidor sobe, os call sites caem
        // no .env e cada leitura seguinte tenta de novo — muito melhor que um
        // processo que se recusa a iniciar porque o banco piscou.
        console.error(
          `[config] preload de "${nome}" falhou — a aplicação sobe assim mesmo:`,
          err,
        );
      }
    },

    invalidate() {
      valor = undefined;
      carregadoEm = 0;
    },

    status() {
      return {
        carregado: valor !== undefined,
        idadeMs: valor === undefined ? null : Date.now() - carregadoEm,
      };
    },
  };
}
