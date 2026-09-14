import ImageURL from "@/assets/logo.png";
import { LoginForm } from "@/components/login-form";
import { getSession } from "@/lib/sessions";
import {
  Brain,
  Globe,
  PenTool,
  Search,
  Send,
  ShieldCheck,
  UserCheck,
} from "lucide-react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { Fragment } from "react";

// Os mesmos seis nós do grafo (src/app/MAS/graph/graph.ts), na mesma ordem e com
// os mesmos ícones do pipeline do dashboard. A ilustração da esquerda É o
// produto — melhor que arte genérica, e não sai do lugar quando o grafo mudar
// porque quem mexer no grafo vai reconhecer esta lista.
//
// HORIZONTAL de propósito: em pé, os seis nós ocupavam ~310px e faziam a tela
// rolar num notebook de 15" (viewport útil ~700px). Deitado custa ~80px.
const PIPELINE = [
  { icon: Search, label: "Researcher" },
  { icon: Brain, label: "Analyst" },
  { icon: PenTool, label: "Writer" },
  { icon: ShieldCheck, label: "Judge" },
  { icon: UserCheck, label: "Você" },
  { icon: Send, label: "Publisher" },
] as const;

const DESTAQUES = [
  { icon: Globe, linha1: "Fontes", linha2: "reais" },
  { icon: ShieldCheck, linha1: "Revisão", linha2: "automática" },
  { icon: UserCheck, linha1: "Aprovação", linha2: "humana" },
] as const;

function MarcaSolera({ tamanho = 38 }: { tamanho?: number }) {
  return (
    <div className="flex items-center gap-3">
      <Image alt="Solera" width={tamanho} height={tamanho} src={ImageURL} />
      <div className="flex flex-col text-left leading-tight">
        <span className="text-xl font-bold text-[var(--text-primary)]">
          Solera
        </span>
        <span className="font-mono text-[11px] tracking-wide text-[var(--text-muted)]">
          MULTI-AGENT
        </span>
      </div>
    </div>
  );
}

function PipelineHorizontal() {
  return (
    <div className="flex items-start">
      {PIPELINE.map((etapa, i) => {
        const Icon = etapa.icon;
        const humano = etapa.label === "Você";
        return (
          <Fragment key={etapa.label}>
            {i > 0 && (
              // mt-[18px] = metade da caixa de 36px, para a linha nascer no
              // centro do ícone em vez de no topo da coluna.
              <div
                aria-hidden
                className="mt-[18px] h-px min-w-2 flex-1 bg-[var(--border-active)]"
              />
            )}
            <div className="flex w-[58px] shrink-0 flex-col items-center gap-2 text-center xl:w-[66px]">
              <div
                className={
                  "flex size-9 items-center justify-center rounded-lg border " +
                  (humano
                    ? "border-[var(--accent-purple)]/40 bg-[var(--accent-purple)]/15 text-[var(--accent-purple)]"
                    : "border-[var(--border-active)] bg-[var(--bg-card)] text-[var(--text-secondary)]")
                }
              >
                <Icon className="size-4" />
              </div>
              <span
                className={
                  "text-[10px] leading-tight " +
                  (humano
                    ? "font-medium text-[var(--accent-purple)]"
                    : "text-[var(--text-muted)]")
                }
              >
                {etapa.label}
              </span>
            </div>
          </Fragment>
        );
      })}
    </div>
  );
}

function PainelMarca() {
  return (
    <div className="relative hidden overflow-hidden border-r border-[var(--border-subtle)] bg-[var(--bg-sidebar)] lg:flex lg:flex-col lg:justify-between lg:p-10 xl:p-12">
      {/* Brilho roxo. `pointer-events-none` porque é decoração e não pode
          roubar clique de nada que venha por cima. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 -left-32 h-[520px] w-[520px] rounded-full bg-[var(--accent-purple)] opacity-[0.07] blur-[120px]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-24 bottom-0 h-[380px] w-[380px] rounded-full bg-[var(--accent-blue)] opacity-[0.05] blur-[120px]"
      />

      <div className="relative">
        <MarcaSolera />
      </div>

      <div className="relative py-8">
        <h1 className="text-[32px] leading-[1.12] font-bold tracking-tight text-[var(--text-primary)] xl:text-[40px]">
          Pesquisa. Redige.
          <br />
          Revisa.
        </h1>
        <p className="mt-4 max-w-md text-[15px] leading-relaxed text-[var(--text-secondary)]">
          Seis agentes coordenados levantam as fontes, extraem os insights,
          escrevem o post e submetem cada versão a um crítico — antes de a
          decisão chegar em você.
        </p>

        <div className="mt-8 max-w-md">
          <PipelineHorizontal />
        </div>
      </div>

      <div className="relative flex gap-7 border-t border-[var(--border-subtle)] pt-6 xl:gap-8">
        {DESTAQUES.map((d) => {
          const Icon = d.icon;
          return (
            <div key={d.linha1} className="flex items-center gap-2.5">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-[var(--accent-purple-dim)] text-[var(--accent-purple)]">
                <Icon className="size-4" />
              </div>
              <div className="text-xs leading-tight text-[var(--text-secondary)]">
                <span className="block">{d.linha1}</span>
                <span className="block">{d.linha2}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  // Quem já tem sessão não vê tela de login. Sem isto, voltar em /login depois
  // de entrar mostrava o botão de novo, como se estivesse deslogado.
  const session = await getSession();
  if (session) redirect("/dashboard");

  // O callback do LinkedIn devolve o motivo em `?error=` e até aqui ninguém
  // lia: a pessoa barrada voltava para uma tela de login idêntica, sem pista
  // nenhuma do que aconteceu.
  const bruto = (await searchParams).error;
  const error = Array.isArray(bruto) ? bruto[0] : bruto;

  return (
    <div className="grid min-h-svh lg:grid-cols-[1.05fr_1fr]">
      <PainelMarca />
      <div className="flex flex-col justify-center bg-[var(--bg-base)] px-6 py-10 md:px-10">
        {/* No mobile o painel da esquerda some, então a marca vem para cá. */}
        <div className="mb-7 flex justify-center lg:hidden">
          <MarcaSolera tamanho={42} />
        </div>
        <div className="mx-auto w-full max-w-sm">
          <LoginForm error={error} />
        </div>
      </div>
    </div>
  );
}
