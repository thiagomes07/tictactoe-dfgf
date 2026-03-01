"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getAudioEnabled, setAudioEnabled } from "@/lib/audio";

const WIZARD_KEY = "dfgf:home-wizard-seen:v1";

const WIZARD_STEPS = [
  {
    title: "Bem-vindo(a) ao escritório DFGF",
    text: "Você está em um escritório brasileiro dos anos 90, no Departamento Federal de Gestão de Formulários. Aqui, cada Formulário 3x3-B funciona como um jogo da velha e cada partida representa uma demanda oficial de trabalho."
  },
  {
    title: "Como a demanda é processada",
    text: "Cada jogada registra um despacho no processo. Você pode jogar em três modalidades: Estagiário(a) vs Sr. Geraldo (IA), Player vs Player Local na mesma máquina ou Player vs Player Remoto por sala com código de protocolo DFGF-0000."
  },
  {
    title: "Chat interno do departamento",
    text: "Durante a partida, você pode enviar mensagens no chat e interagir com os funcionários do setor. Marlene, Túlio, Patrícia, Sistema DFGF e o Sr. Geraldo respondem com personalidades próprias enquanto comentam o andamento da demanda em tempo real."
  },
  {
    title: "Arquivo Morto e encerramento",
    text: "Ao fim da partida, o resultado é registrado no Arquivo Morto local com status DEFERIDO, INDEFERIDO ou ARQUIVADO. Se você sair no meio do processo, a demanda parcial também é registrada."
  }
] as const;

export function HomePageClient() {
  const [wizardOpen, setWizardOpen] = useState(false);
  const [stepIndex, setStepIndex] = useState(0);
  const [bgmEnabled, setBgmEnabled] = useState(false);

  useEffect(() => {
    const alreadySeen = window.localStorage.getItem(WIZARD_KEY) === "1";
    const wasBgmEnabled = getAudioEnabled();

    setWizardOpen(!alreadySeen);
    setBgmEnabled(wasBgmEnabled);
  }, []);

  const isLastStep = stepIndex === WIZARD_STEPS.length - 1;
  const currentStep = useMemo(() => WIZARD_STEPS[stepIndex], [stepIndex]);

  const closeWizard = () => {
    window.localStorage.setItem(WIZARD_KEY, "1");
    setWizardOpen(false);
  };

  const finishWizard = () => {
    setBgmEnabled(true);
    setAudioEnabled(true);
    closeWizard();
  };

  return (
    <>
      {wizardOpen ? (
        <div className="wizard-backdrop" role="dialog" aria-modal="true" aria-label="Introdução ao departamento">
          <section className="wizard-modal">
            <p className="wizard-title">Integração de Novo Estagiário(a)</p>
            <p className="wizard-step">Etapa {stepIndex + 1} de {WIZARD_STEPS.length}</p>
            <h2 className="wizard-heading">{currentStep.title}</h2>
            <p className="wizard-text">{currentStep.text}</p>

            <div className="wizard-actions">
              <button
                type="button"
                className="action-btn"
                onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
                disabled={stepIndex === 0}
                style={{ opacity: stepIndex === 0 ? 0.45 : 1 }}
              >
                Voltar
              </button>

              {!isLastStep ? (
                <button type="button" className="action-btn" onClick={() => setStepIndex((prev) => prev + 1)}>
                  Próxima etapa
                </button>
              ) : (
                <button type="button" className="action-btn" onClick={finishWizard}>
                  Iniciar expediente com trilha
                </button>
              )}

              <button
                type="button"
                className="action-btn action-btn-danger"
                onClick={() => {
                  setAudioEnabled(false);
                  setBgmEnabled(false);
                  closeWizard();
                }}
              >
                Entrar sem trilha
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <main className="space-y-4">
        <section className="paper-sheet !rotate-[0.11deg]">
          <header className="paper-header">
            <div className="paper-emblem" aria-hidden="true">
              <svg fill="none" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M4 20H20M6 20V8L12 4L18 8V20M9 12H15" strokeWidth="1.2" />
              </svg>
            </div>

            <div>
              <p className="paper-headline">Abertura de Processo - Formulário 3x3-B</p>
              <p className="paper-meta">Selecione a modalidade para iniciar tramitação interna</p>
            </div>

            <div className="protocol-box">
              <div className="window-controls window-controls-inline" aria-hidden="true">
                <span className="window-control">_</span>
                <span className="window-control">[]</span>
                <span className="window-control">x</span>
              </div>
              <div>Despacho inicial</div>
              <div className="protocol-code">PENDENTE</div>
            </div>
          </header>

          <div className="form-lines space-y-4">
            <div className="status-strip">
              Assinatura digital da chefia: Sr. Geraldo - "Não li o processo, mas aprovo a iniciativa"
            </div>

            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
              <article className="mode-card">
                <div className="mode-title-row">
                  <span className="pixel-icon icon-monitor" aria-hidden="true" />
                  <h2 className="mode-title">Estagiário vs Sr. Geraldo</h2>
                </div>
                <p className="mode-text">
                  Modo principal. Chat completo, comentários de equipe e duelo direto contra liderança confiante.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="action-btn" href="/jogo?mode=vs_ai&difficulty=pre_almoco" data-win-tooltip="Abrir modo fácil">
                    Geraldo Pré-Almoço
                  </Link>
                  <Link
                    className="action-btn"
                    href="/jogo?mode=vs_ai&difficulty=avaliação_anual"
                    data-win-tooltip="Abrir modo difícil"
                  >
                    Modo Avaliação Anual
                  </Link>
                </div>
              </article>

              <article className="mode-card">
                <div className="mode-title-row">
                  <span className="pixel-icon icon-board" aria-hidden="true" />
                  <h2 className="mode-title">Player vs Player Local</h2>
                </div>
                <p className="mode-text">
                  Dois estagiários na mesma máquina disputam a demanda enquanto o departamento comenta cada decisão.
                </p>

                <div className="mt-3">
                  <Link className="action-btn" href="/jogo?mode=pvp_local" data-win-tooltip="Iniciar confronto local">
                    Abrir disputa local
                  </Link>
                </div>
              </article>

              <article className="mode-card">
                <div className="mode-title-row">
                  <span className="pixel-icon icon-network" aria-hidden="true" />
                  <h2 className="mode-title">Player vs Player Remoto</h2>
                </div>
                <p className="mode-text">
                  Criação de sala por código de protocolo DFGF-0000 com fluxo de entrada por convite.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="action-btn" href="/sala" data-win-tooltip="Criar ou entrar em sala remota">
                    Gerenciar salas
                  </Link>
                </div>
              </article>
            </div>

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  const next = !bgmEnabled;
                  setBgmEnabled(next);
                  setAudioEnabled(next);
                }}
              >
                {bgmEnabled ? "Pausar trilha" : "Tocar trilha"}
              </button>

              <button
                type="button"
                className="action-btn"
                onClick={() => {
                  setStepIndex(0);
                  setWizardOpen(true);
                }}
              >
                Reabrir orientação inicial
              </button>
            </div>
          </div>

          <footer className="official-footer">
            Manual oficial: Formulário 3x3-B - qualquer divergência deve ser encaminhada à chefia imediata
          </footer>
        </section>
      </main>
    </>
  );
}
