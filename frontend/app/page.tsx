type BackendHealth = {
  status: string;
  service: string;
};

async function getBackendHealth(): Promise<BackendHealth | null> {
  const backendUrl = process.env.BACKEND_INTERNAL_URL ?? "http://localhost:8080";

  try {
    const response = await fetch(`${backendUrl}/health`, { cache: "no-store" });
    if (!response.ok) return null;
    return (await response.json()) as BackendHealth;
  } catch {
    return null;
  }
}

export default async function Home() {
  const health = await getBackendHealth();

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-4xl flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-semibold">DFGF - Base da Arquitetura</h1>
      <p className="text-sm text-neutral-700">Frontend Next.js + Tailwind pronto para evoluir.</p>

      <section className="rounded border border-neutral-300 bg-white p-4">
        <h2 className="text-lg font-medium">Conectividade com backend</h2>
        {health ? (
          <p className="mt-2 text-sm">{`Status: ${health.status} (${health.service})`}</p>
        ) : (
          <p className="mt-2 text-sm text-red-700">Backend indisponível.</p>
        )}
      </section>
    </main>
  );
}
