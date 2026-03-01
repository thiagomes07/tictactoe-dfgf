"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import { getAudioEnabled, setAudioEnabled } from "@/lib/audio";

const WIZARD_KEY = "dfgf:home-wizard-seen:v1";

const WIZARD_STEPS = [
  {
    title: "Boas-vindas ao DFGF",
    text: "Voce foi alocado(a) para o Departamento Federal de Gestao de Formularios. Cada partida e um processo e cada jogada e um despacho oficial."
  },
  {
    title: "Como funciona",
    text: "No formulario 3x3-B, voce disputa aprovacoes com o Sr. Geraldo, com estagiarios locais ou em sala remota por codigo de protocolo DFGF-0000."
  },
  {
    title: "Chat corporativo",
    text: "Marlene, Tulio, Patricia de RH e Sistema DFGF comentam tudo em tempo real. Use o chat para interagir e acompanhar a burocracia acontecendo."
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
        <div className="wizard-backdrop" role="dialog" aria-modal="true" aria-label="Introducao ao departamento">
          <section className="wizard-modal">
            <p className="wizard-title">Integracao de Novo Estagiario(a)</p>
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
                  Proxima etapa
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
              <p className="paper-headline">Abertura de Processo - Formulario 3x3-B</p>
              <p className="paper-meta">Selecione a modalidade para iniciar tramitacao interna</p>
            </div>

            <div className="protocol-box">
              <div>Despacho inicial</div>
              <div className="protocol-code">PENDENTE</div>
            </div>
          </header>

          <div className="form-lines space-y-4">
            <div className="status-strip">
              Assinatura digital da chefia: Sr. Geraldo - "Nao li o processo, mas aprovo a iniciativa"
            </div>

            <div className="mx-auto flex w-full max-w-[760px] flex-col gap-3">
              <article className="mode-card">
                <h2 className="mode-title">Estagiario vs Sr. Geraldo</h2>
                <p className="mode-text">
                  Modo principal. Chat completo, comentarios de equipe e duelo direto contra lideranca confiante.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="action-btn" href="/jogo?mode=vs_ai&difficulty=pre_almoco">
                    Geraldo Pre-Almoco
                  </Link>
                  <Link className="action-btn" href="/jogo?mode=vs_ai&difficulty=avaliacao_anual">
                    Modo Avaliacao Anual
                  </Link>
                </div>
              </article>

              <article className="mode-card">
                <h2 className="mode-title">Player vs Player Local</h2>
                <p className="mode-text">
                  Dois estagiarios na mesma maquina disputam a demanda enquanto o departamento comenta cada decisao.
                </p>

                <div className="mt-3">
                  <Link className="action-btn" href="/jogo?mode=pvp_local">
                    Abrir disputa local
                  </Link>
                </div>
              </article>

              <article className="mode-card">
                <h2 className="mode-title">Player vs Player Remoto</h2>
                <p className="mode-text">
                  Criacao de sala por codigo de protocolo DFGF-0000 com fluxo de entrada por convite.
                </p>

                <div className="mt-3 flex flex-wrap gap-2">
                  <Link className="action-btn" href="/sala">
                    Gerenciar zzsalas
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
                Reabrir orientacao inicial
              </button>
            </div>
          </div>

          <footer className="official-footer">
            Manual oficial: Formulario 3x3-B - qualquer divergencia deve ser encaminhada a chefia imediata
          </footer>
        </section>
      </main>
    </>
  );
}
