// Pré-carga da configuração — SÓ no runtime Node.
//
// Importado por `register()` em src/instrumentation.ts, que roda uma vez por
// instância do servidor e completa ANTES da primeira requisição. Com a config
// já em memória, nenhum nó do grafo e nenhuma rota espera o banco para
// descobrir uma chave de API ou o modelo de um agente.
//
// O QUE ISTO CONSERTA. O banco fica em outra região (~300ms de RTT por query) e
// o agente de pesquisa relia a chave do provedor de busca A CADA chamada da
// ferramenta. Uma execução do grafo fazia ~10 leituras em série, e quando o
// pooler demorava a devolver slot a execução travava em `researching` — sem
// erro, sem timeout, sem fim.
//
// O EFEITO É A IMPORTAÇÃO. Este módulo executa ao ser importado; é o formato
// que a doc do Next usa para código específico de runtime.
//
// O BOOT NÃO FALHA POR CAUSA DISTO. Cada preload tem teto de tempo próprio e
// engole o erro (ver lib/configCache.ts): se o Postgres estiver fora do ar, o
// servidor sobe assim mesmo, os call sites caem no `.env` e cada leitura
// seguinte tenta de novo. Um processo que se recusa a iniciar porque o banco
// piscou seria pior que a doença.

import { preloadAgentConfig } from "@/app/MAS/lib/configStore";
import { preloadSettings } from "@/app/MAS/lib/settingsStore";
import { preloadAccessMatrix } from "@/lib/permissions";
import { preloadUsers } from "@/lib/users";

const t0 = Date.now();
// Em paralelo: são quatro tabelas independentes e o boot espera por todas.
//
// `users` e `role_permissions` entraram aqui porque eram o custo fixo de TODA
// página e de TODA rota de API — 631ms para ler uma linha de papel, mais 300ms
// da matriz, mais outra checagem de permissão por rota. Nenhuma delas é query
// pesada; é ida e volta a outra região, paga repetidamente.
await Promise.all([
  preloadSettings(),
  preloadAgentConfig(),
  preloadUsers(),
  preloadAccessMatrix(),
]);
console.log(`[boot] config carregada em ${Date.now() - t0}ms`);
