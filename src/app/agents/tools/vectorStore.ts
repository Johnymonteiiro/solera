

// Stub para desenvolvimento — implementar Chroma/Pinecone em produção

import { ResearchResult } from "../types/types";

export async function storeResults(_results: ResearchResult[]): Promise<void> {
  // TODO: implementar com @langchain/community/vectorstores/chroma em dev
  // e Pinecone em prod
}

export async function retrieveSimilar(_query: string): Promise<ResearchResult[]> {
  // TODO: implementar retrieval vetorial
  return [];
}
