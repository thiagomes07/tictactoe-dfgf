import { Suspense } from "react";

import { GamePageClient } from "@/features/board/game-page-client";

export default function GamePage() {
  return (
    <Suspense fallback={<main className="status-strip">Carregando processo em tramitação...</main>}>
      <GamePageClient />
    </Suspense>
  );
}
