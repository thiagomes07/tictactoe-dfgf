"use client";

import { useBackendHealthQuery } from "@/hooks/use-backend-health-query";

export function BackendHealthCard() {
  const health = useBackendHealthQuery();

  return (
    <section className="rounded border border-neutral-300 bg-white p-4">
      <h2 className="text-lg font-medium">Conectividade com backend</h2>

      {health.isLoading && <p className="mt-2 text-sm text-neutral-700">Verificando...</p>}

      {health.isError && (
        <div className="mt-2 text-sm text-red-700">
          <p>Backend indisponivel no contrato /v1/health.</p>
          <button
            type="button"
            onClick={() => health.refetch()}
            className="mt-2 rounded border border-red-700 px-2 py-1 text-xs"
          >
            Tentar novamente
          </button>
        </div>
      )}

      {health.data && (
        <div className="mt-2 text-sm text-neutral-800">
          <p>{`Status: ${health.data.status}`}</p>
          <p>{`Servico: ${health.data.service}`}</p>
          <p>{`Versao: ${health.data.version}`}</p>
          <p>{`Horario backend: ${health.data.now}`}</p>
        </div>
      )}
    </section>
  );
}
