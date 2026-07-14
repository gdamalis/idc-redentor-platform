"use client";

import * as Sentry from "@sentry/nextjs";
import { Nunito_Sans } from "next/font/google";
import Image from "next/image";
import { useEffect } from "react";
import "./globals.css";

const nunitoSans = Nunito_Sans({
  subsets: ["latin"],
  variable: "--font-nunito-sans",
});

interface GlobalErrorProps {
  readonly error: Error & { digest?: string };
  readonly reset: () => void;
}

export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Last-resort boundary: if the root layout itself failed, nothing else will
    // have reported this error, so send it to Sentry (ICR-117).
    Sentry.captureException(error);
    // Kept from ICR-111: Sentry is inert when no DSN is configured (e.g. local
    // dev), and this keeps the error visible there.
    console.error(error);
  }, [error]);

  return (
    <html lang="es-AR">
      <body className={`${nunitoSans.variable} font-sans antialiased`}>
        <div className="min-h-screen flex flex-col items-center justify-center text-center px-4 ">
          <div className="max-w-lg p-8  shadow-lg rounded-lg">
            <div className="flex justify-center mb-8">
              <Image
                src="/assets/img/redentor_logo_100.png"
                className="h-24 w-24"
                width={96}
                height={96}
                alt="Redentor church logo"
                priority
              />
            </div>
            <h1 className="text-4xl font-bold mb-4 text-gray-900">
              Algo salió mal
            </h1>
            <p className="mb-8 text-lg text-gray-600">
              Tuvimos un problema al cargar esta página. Podés intentar de nuevo
              o volver al inicio.
            </p>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={reset}
                className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-white hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                Intentar de nuevo
              </button>
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}
