/**
 * Normaliza o tópico p/ agrupar variações de digitação (caixa, acento, "?").
 *
 * Mora num módulo folha (sem imports) de propósito: tanto `studySample` quanto
 * `studyRecorder` precisam dela, e deixá-la em `studySample` criava o ciclo
 * threadStore → studyRecorder → studySample → threadStore.
 */
export function normalizeTopic(topic: string): string {
  return (topic ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
