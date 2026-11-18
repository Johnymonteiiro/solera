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

/**
 * Tentativas do preload ANTES de liberar o boot, e a espera entre elas.
 *
 * Uma tentativa só não basta. Medido em 2026-09-18: uma conexão nova até o
 * pooler leva 1,4–2,0s (25 de 25), mas houve um boot em que as quatro
 * estouraram o `connect_timeout` de 10s JUNTAS — engasgo de rede, não do banco,
 * e segundos depois tudo conectava de novo. Com uma tentativa, esse engasgo
 * virava um servidor inteiro rodando com cache frio. Pior caso do boot com
 * estes valores: ~34s (3 × 10s de connect + 1s + 3s).
 */
const PRELOAD_ESPERAS_MS = [1_000, 3_000];

/**
 * Se nem assim carregar, o boot segue e a leitura continua sendo tentada em
 * segundo plano neste intervalo — a config volta sozinha quando a rede voltar,
 * em vez de esperar a primeira requisição pagar a leitura.
 */
const RETENTATIVA_FUNDO_MS = 15_000;

/** Uma linha: o motivo da falha sem o stack da query (o Drizzle embrulha o erro de rede em `cause`). */
function resumo(err: unknown): string {
  const e = err as { message?: string; code?: string; cause?: { message?: string; code?: string } };
  const causa = e?.cause?.message ?? e?.message ?? String(err);
  const code = e?.cause?.code ?? e?.code;
  return code && !causa.includes(code) ? `${code} — ${causa}` : causa;
}

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

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

  let retentativa: NodeJS.Timeout | undefined;

  /** Tenta carregar em intervalos até conseguir. Para sozinho quando há valor. */
  function retentaEmFundo(): void {
    if (retentativa) return;
    retentativa = setInterval(() => {
      if (valor !== undefined) {
        clearInterval(retentativa);
        retentativa = undefined;
        return;
      }
      recarrega(CONFIG_PRELOAD_TIMEOUT_MS).then(
        () => {
          console.log(`[config] "${nome}" carregada em segundo plano, depois da falha no boot`);
          clearInterval(retentativa);
          retentativa = undefined;
        },
        (err) => console.warn(`[config] "${nome}" ainda sem carregar: ${resumo(err)}`),
      );
    }, RETENTATIVA_FUNDO_MS);
    // Não segura o processo: um script de CLI tem que poder encerrar.
    retentativa.unref();
  }

  return {
    async get() {
      if (valor !== undefined) {
        if (Date.now() - carregadoEm >= CONFIG_TTL_MS) {
          // Revalida SEM esperar: o caminho quente não paga I/O. O catch é
          // obrigatório — promise rejeitada sem handler derruba o processo.
          void recarrega(CONFIG_READ_TIMEOUT_MS).catch((err) => {
            console.warn(
              `[config] revalidação de "${nome}" falhou — seguindo com o valor em memória: ${resumo(err)}`,
            );
          });
        }
        return valor;
      }
      // Cache frio: aqui sim vale esperar, porque não há alternativa correta.
      // Depois do preload no boot, este ramo não deveria ser alcançado — mas
      // scripts de CLI não têm preload e sempre passam por aqui.
      //
      // Teto do PRELOAD, não o de 5s: a alternativa a esperar é o .env/defaults,
      // que é config errada. E 5s é menos que um `connect_timeout` (10s) — em
      // 2026-09-18 um engasgo de rede fez a leitura passar de 5s, o script caiu
      // no .env e a chave do OpenRouter (que só existe no banco) "sumiu".
      try {
        return await recarrega(CONFIG_PRELOAD_TIMEOUT_MS);
      } catch (err) {
        console.error(
          `[config] "${nome}" nunca pôde ser lida — caindo no .env/defaults: ${resumo(err)}`,
        );
        // Sem valor ainda: garante que alguém siga tentando, mesmo que o
        // preload do boot não tenha chegado a agendar.
        retentaEmFundo();
        return vazio();
      }
    },

    async preload() {
      const total = PRELOAD_ESPERAS_MS.length + 1;
      for (let tentativa = 1; tentativa <= total; tentativa++) {
        try {
          await recarrega(CONFIG_PRELOAD_TIMEOUT_MS);
          if (tentativa > 1) {
            console.log(`[config] "${nome}" carregada na tentativa ${tentativa}/${total}`);
          }
          return;
        } catch (err) {
          console.warn(
            `[config] preload de "${nome}" falhou (tentativa ${tentativa}/${total}): ${resumo(err)}`,
          );
          const ms = PRELOAD_ESPERAS_MS[tentativa - 1];
          if (ms !== undefined) await espera(ms);
        }
      }
      // Boot NÃO falha por causa disto — um processo que se recusa a iniciar
      // porque a rede piscou seria pior. Mas também não desiste: segue tentando
      // em segundo plano até carregar.
      console.error(
        `[config] "${nome}" não carregou no boot — tentando de novo a cada ${RETENTATIVA_FUNDO_MS / 1000}s em segundo plano`,
      );
      retentaEmFundo();
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
