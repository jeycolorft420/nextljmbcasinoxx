// src/app/register/page.tsx
"use client";

import { Suspense } from "react";
import RegisterClient from "./RegisterClient";

export default function RegisterPage() {
  return (
    <main className="container-page">
      <Suspense fallback={<div className="grid place-items-center p-6">Cargando…</div>}>
        <div className="max-w-md mx-auto w-full">
          <RegisterClient />
        </div>
      </Suspense>
    </main>
  );
}
