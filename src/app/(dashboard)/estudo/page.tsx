import { CorpusPanel } from "@/components/dashboard/corpus-panel";
import { EstudoView } from "@/components/dashboard/estudo-view";
import { RefreshButton } from "@/components/dashboard/refresh-button";
import { Topbar } from "@/components/dashboard/topbar";
import { requireAreaPage } from "@/lib/dal";

export default async function Page() {
  // A matriz de acesso decide (padrão: colaborador para cima). As rotas de
  // export checam a mesma área por conta própria — esta guarda é a da página.
  await requireAreaPage("estudo");

  return (
    <>
      <Topbar
        title="Estudo"
        subtitle="O Judge é um gate confiável?"
        actions={<RefreshButton />}
      />
      <div className="flex flex-1 flex-col gap-10 overflow-y-auto p-7">
        {/* Pares antes/depois. Foi o desenho do formulário até 2026-09-02 e
            NÃO é mais: com firstPassRate 100% o Judge nunca reprovou, então não
            existe "depois" — 0 pares no banco. Fica como material de MECANISMO
            (ver o Judge empacar reescrita após reescrita é achado por si só).

            O upload de CSV daqui espera as colunas da rubrica v1
            (`A_overall`, `A_hook`…). O CSV do formulário atual usa `[A1]` e
            carrega VAZIO aqui, sem erro. Análise: study/analysis/gate_study.py. */}
        <EstudoView />

        {/* Corpus de v1 individuais — o desenho VIGENTE do formulário humano:
            Judge × 3 humanos no MESMO post, mesmo instrumento, decisão
            calculada pela mesma regra dos dois lados. É o desenho do
            Evaluation-Process.md; protocolo em study/COLETA.md. */}
        <div className="border-t border-[var(--border-subtle)] pt-8">
          <p className="mb-5 text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
            Corpus do formulário humano · v1 de cada execução
          </p>
          <CorpusPanel />
        </div>
      </div>
    </>
  );
}
