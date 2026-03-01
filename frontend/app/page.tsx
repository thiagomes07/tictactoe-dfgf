import { BackendHealthCard } from "@/components/backend-health-card";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-4 px-6 py-10">
      <h1 className="text-3xl font-semibold">DFGF - Frontend Contract-First</h1>
      <p className="text-sm text-neutral-700">
        Base pronta com contratos de API, cliente HTTP tipado, hooks e WebSocket para o backend implementar.
      </p>

      <BackendHealthCard />

      <section className="rounded border border-neutral-300 bg-white p-4 text-sm text-neutral-800">
        <h2 className="text-lg font-medium">Rotas esperadas do backend</h2>
        <ul className="mt-2 list-disc pl-6">
          <li><code>GET /v1/health</code></li>
          <li><code>POST /v1/matches</code></li>
          <li><code>GET /v1/matches/:matchId</code></li>
          <li><code>POST /v1/matches/:matchId/moves</code></li>
          <li><code>GET /v1/matches/:matchId/chat/messages</code></li>
          <li><code>POST /v1/matches/:matchId/chat/messages</code></li>
          <li><code>POST /v1/rooms</code></li>
          <li><code>GET /v1/rooms/:roomCode</code></li>
          <li><code>POST /v1/rooms/:roomCode/join</code></li>
          <li><code>WS /v1/ws/matches/:matchId</code></li>
        </ul>
      </section>
    </main>
  );
}
