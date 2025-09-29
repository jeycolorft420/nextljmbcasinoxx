// src/app/register/page.tsx
"use client";

import { Suspense } from "react";
import RegisterClient from "./RegisterClient";

export default function RegisterPage() {
  return (
    <Suspense fallback={<main className="min-h-screen grid place-items-center p-6">Cargando…</main>}>
      <RegisterClient />
    </Suspense>
  );
}

