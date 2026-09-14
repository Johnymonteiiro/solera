import { SEARCH_TIMEOUT_MS } from "../../constants";
import { NavigatorOptions, NavigatorProvider, ResearchResult } from "../../types/types";
import { searchBrave, searchTavily } from "./providers";

const handlers: Record<
  NavigatorProvider,
  (options: NavigatorOptions) => Promise<ResearchResult[]>
> = {
  tavily: searchTavily,
  brave: searchBrave,
};

/**
 * Teto de tempo para qualquer provedor.
 *
 * O Brave já aborta o socket pelo AbortSignal; isto aqui é a rede que pega o
 * que NÃO dá para abortar — o SDK do Tavily não expõe cancelamento, e um
 * provedor novo entra sem trazer timeout próprio. O ponto é liberar o grafo:
 * uma execução que falha é recuperável, uma que fica presa em `researching`
 * para sempre não é.
 *
 * Ressalva assumida: no caminho do race a requisição continua viva em segundo
 * plano até o runtime derrubá-la. Vazamento pequeno e limitado, preço de não
 * pendurar o pipeline.
 */
async function withTimeout(
  provider: NavigatorProvider,
  work: Promise<ResearchResult[]>,
): Promise<ResearchResult[]> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(
          () =>
            reject(
              new Error(
                `${provider} não respondeu em ${SEARCH_TIMEOUT_MS / 1000}s`,
              ),
            ),
          SEARCH_TIMEOUT_MS,
        );
      }),
    ]);
  } finally {
    // Sem isto o timer segura o event loop e o processo não encerra sozinho —
    // o que quebraria os scripts de CLI mesmo depois de a busca dar certo.
    if (timer) clearTimeout(timer);
  }
}

export async function navigator(
  provider: NavigatorProvider,
  options: NavigatorOptions
): Promise<ResearchResult[]> {
  const handler = handlers[provider];
  if (!handler) throw new Error(`Provider "${provider}" não suportado.`);
  return withTimeout(provider, handler(options));
}

export type { NavigatorOptions, NavigatorProvider, ResearchResult };

