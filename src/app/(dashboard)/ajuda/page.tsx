import { Topbar } from "@/components/dashboard/topbar";

export default function Page() {
  return (
    <>
      <Topbar title="Ajuda" subtitle="documentação e suporte" />
      <div className="flex-1 overflow-y-auto p-7">
        <div className="flex max-w-2xl flex-col gap-4 text-[13px] leading-relaxed text-[var(--text-secondary)]">
          <p>
            O Solera é um sistema multi-agente que gera posts de LinkedIn. O
            pipeline passa por Researcher → Analyst → Writer → Judge → revisão
            humana (HITL) → Publisher.
          </p>
          <ul className="flex list-disc flex-col gap-1.5 pl-5">
            <li>
              <strong>Nova publicação:</strong> use o botão flutuante ou o menu
              superior para disparar um pipeline.
            </li>
            <li>
              <strong>Configurar agentes:</strong> ative/desative agentes e edite
              papéis e prompts.
            </li>
            <li>
              <strong>Ferramentas:</strong> ajuste a pesquisa web (provider e nº de
              resultados).
            </li>
            <li>
              <strong>Configurações:</strong> gerencie chaves de API e credenciais
              do LinkedIn.
            </li>
          </ul>
        </div>
      </div>
    </>
  );
}
