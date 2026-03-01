import type { Metadata } from "next";
import { Courier_Prime, Special_Elite, VT323 } from "next/font/google";

import { AppProviders } from "@/app/providers";
import { DepartmentHeader } from "@/components/department-header";
import { GlobalAudioPlayer } from "@/components/global-audio-player";
import "./globals.css";

const courierPrime = Courier_Prime({
  subsets: ["latin"],
  variable: "--font-courier-prime",
  weight: ["400", "700"],
  display: "swap"
});

const vt323 = VT323({
  subsets: ["latin"],
  variable: "--font-vt323",
  weight: "400",
  display: "swap"
});

const specialElite = Special_Elite({
  subsets: ["latin"],
  variable: "--font-special-elite",
  weight: "400",
  display: "swap"
});

// If you placed a `favicon.ico` in the `public/` folder, Next will serve it at `/favicon.ico`.
// The `icons` field ensures Next injects the appropriate <link> tags for various platforms.
export const metadata: Metadata = {
  title: "DFGF - Formulario 3x3-B",
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
      <body className={`${courierPrime.variable} ${vt323.variable} ${specialElite.variable}`}>
        <AppProviders>
          <GlobalAudioPlayer />
          <div className="dfgf-shell">
            <DepartmentHeader />
            {children}
          </div>
        </AppProviders>
      </body>
    </html>
  );
}
