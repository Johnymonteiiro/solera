import { BaseMessage } from "@langchain/core/messages";
import { Annotation, messagesStateReducer } from "@langchain/langgraph";
import { AgentStatus, CritiqueResult, HumanFeedback, NavigatorProvider, ResearchResult, SearchLanguage } from "../types/types";

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
    critique: Annotation<CritiqueResult>({
    value: (_prev, next) => next,
    default: () => ({
        score: 0,
        hookQuality: 0,
        lengthAdequate: false,
        toneLinkedIn: false,
        issues: [],
        suggestions: [],
    })
  }),

   // armazenar o feedback humano, que pode ser atualizado várias vezes
  humanFeedback: Annotation<HumanFeedback | null>({
    value: (_prev, next) => next,
    default: () => null,
  }),

  // contar o número de revisões feitas no rascunho
  revisionCount: Annotation<number>({
    reducer: (prev, next) => prev + next,
    default: () => 0,
  }),

  // status do agente
  status: Annotation<AgentStatus>({
    value: (_prev, next) => next,
    default: () => "idle" as AgentStatus,
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
