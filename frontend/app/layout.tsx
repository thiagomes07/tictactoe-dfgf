import type { Metadata } from "next";
import { Suspense } from "react";

import { AppProviders } from "@/app/providers";
import { DesktopTaskbar } from "@/components/desktop-taskbar";
import { DepartmentHeader } from "@/components/department-header";
import { GlobalAudioPlayer } from "@/components/global-audio-player";
import "./globals.css";

// If you placed a `favicon.ico` in the `public/` folder, Next will serve it at `/favicon.ico`.
// The `icons` field ensures Next injects the appropriate <link> tags for various platforms.
export const metadata: Metadata = {
  title: "DFGF - Formulário 3x3-B",
  description: "Burocracia S.A. - simulador de processos burocraticos",
  icons: {
    icon: "/favicon.ico",
    shortcut: "/favicon.ico",
    apple: "/favicon.ico"
  }
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>
        <AppProviders>
          <GlobalAudioPlayer />
          <div className="dfgf-desktop">
            <div className="dfgf-shell">
              <Suspense fallback={<div className="dfgf-topline">Carregando cabecalho do departamento...</div>}>
                <DepartmentHeader />
              </Suspense>
              <div className="desktop-workspace">{children}</div>
            </div>
            <DesktopTaskbar />
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
