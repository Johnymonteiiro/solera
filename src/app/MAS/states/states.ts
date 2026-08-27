import { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AgentStatus, JudgeResult, HumanFeedback, NavigatorProvider, PostSize, ResearchResult, SearchLanguage, StoppedReason } from "../types/types";

/*
 Porque o state é importante?
 O state é o coração do agente, onde ele armazena tudo o que sabe e o que está fazendo.
 Ele é essencial para a tomada de decisões, para a execução de tarefas e para a interação com o usuário.
 Sem um state bem definido, o agente seria apenas um conjunto de funções sem memória ou contexto.
*/

export const AgentState = Annotation.Root({
  // definir o topico do post a ser criado
  topic: Annotation<string>(),

  navigatorProvider: Annotation<NavigatorProvider>({
    value: (_prev, next) => next,
    default: () => "tavily",
  }),

  language: Annotation<SearchLanguage>({
    value: (_prev, next) => next,
    default: () => "pt-BR",
  }),

  postSize: Annotation<PostSize>({
    value: (_prev, next) => next,
    default: () => "small",
  }),

  // Modo experimento (estudo Agent-as-judge): quando false, o judge ainda
  // pontua o draft (para termos a nota do agente), mas routeAfterJudge nunca
  // devolve pro writer — não há reescrita automática. = config judge.enabled.
  judgeLoop: Annotation<boolean>({
    value: (_prev, next) => next,
    default: () => true,
  }),

  // Agentes desativados na config (/agentes). Cada nó verifica e vira passthrough
  // quando está aqui (o judge é controlado pelo judgeLoop, não por esta lista).
  disabledAgents: Annotation<string[]>({
    value: (_prev, next) => next,
    default: () => [],
  }),

  researchResults: Annotation<ResearchResult[]>({
    // acumular os resultados de pesquisa ao longo do tempo
    reducer: (prev, next) => [...prev, ...next],
    // iniciar com um array vazio
    default: () => [],
  }),

  insights: Annotation<string[]>({
    // acumular os insights de pesquisa ao longo do tempo
    reducer: (prev, next) => [...prev, ...next],
    // iniciar com um array vazio
    default: () => [],
  }),

  // armazenar o rascunho do post, que pode ser atualizado várias vezes
  draft: Annotation<string>({
    value: (_prev, next) => next,
    default: () => "",
  }),

  // armazenar a crítica do post, que pode ser atualizada várias vezes
    judgement: Annotation<JudgeResult>({
    value: (_prev, next) => next,
    default: () => ({
        score: 0,
        hookQuality: 0,
        originality: 0,
        scannability: 0,
        ctaQuality: 0,
        lengthAdequate: false,
        toneLinkedIn: false,
        hasEngagementBait: false,
        hasExternalLinkInBody: false,
        issues: [],
        suggestions: [],
    })
  }),

   // armazenar o feedback humano, que pode ser atualizado várias vezes
  humanFeedback: Annotation<HumanFeedback | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),

  // Timestamp do último humanFeedback de "reject" já consumido pelo writer.
  // Permite manter humanFeedback persistente no state (para o HUMAN OVERRIDE
  // continuar valendo através do loop judge↔writer) sem over-contar
  // revisionCount em cada cycle.
  lastAppliedFeedbackAt: Annotation<string | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),

  // contar o número de revisões feitas no rascunho
  revisionCount: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  // contar quantas vezes o judge disparou re-escrita automática.
  // Cap em MAX_JUDGE_RETRIES pra evitar loop writer↔judge infinito.
  // Setter (não aditivo) — writer calcula o próximo valor lendo state.judgeRetries
  // e zera explicitamente em revisão humana ou restart_research.
  judgeRetries: Annotation<number>({
    value: (_prev, next) => next,
    default: () => 0,
  }),

  // status do agente
  status: Annotation<AgentStatus>({
    value: (_prev, next) => next,
    default: () => "idle" as AgentStatus,
  }),

  // Razão do stop (quando status==="stopped"). Permite a UI distinguir
  // entre user cancelar no HITL, researcher abortar por tópico inválido, etc.
  stoppedReason: Annotation<StoppedReason | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),

  // URL do post final publicado, que pode ser atualizado uma vez
  finalPostUrl: Annotation<string | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),

  //  histórico de mensagens trocadas entre o agente e o usuário, acumulando ao longo do tempo
  messages: Annotation<BaseMessage[]>({
    reducer: messagesStateReducer,
    default: () => [],
  })
});

export type State = typeof AgentState.State;
