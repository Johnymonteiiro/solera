

export const ANALYST_PROMPT = `
Analise as fontes acima e extraia de 3 a 5 insights principais que:
- Sejam acionáveis e surpreendentes para profissionais
- Incluam dados concretos ou estatísticas quando disponíveis
- Identifiquem o ângulo mais forte (educacional, opinião ou case prático)
- Sejam relevantes para o público do LinkedIn

Responda APENAS com JSON válido neste formato:
{
  "insights": [
    "insight 1 completo e específico",
    "insight 2 completo e específico",
    "insight 3 completo e específico"
  ]
}`;