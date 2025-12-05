// src/app/login/page.tsx
"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });
    setLoading(false);
    if (res?.ok) router.push("/dashboard");
    else alert("Credenciales inválidas");
  };

  return (
    <main className="container-page">
      <div className="max-w-sm mx-auto">
        <form onSubmit={submit} className="w-full space-y-4 border p-6 rounded-xl card">
          <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
          <input
            className="w-full border p-2 rounded bg-transparent"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e)=>setEmail(e.target.value)}
            required
          />
          <input
            className="w-full border p-2 rounded bg-transparent"
            placeholder="Contraseña"
            type="password"
            value={password}
            onChange={(e)=>setPassword(e.target.value)}
            required
          />
          <button disabled={loading} className="w-full btn btn-primary font-medium">
            {loading ? "Entrando..." : "Entrar"}
          </button>

          <p className="text-sm">
            ¿Aún no tienes cuenta?{" "}
            <Link className="underline" href="/register">Regístrate</Link>
          </p>

          <div className="text-xs opacity-80">
            ¿Olvidaste tu contraseña?{" "}
            <Link href="/support" className="underline">Abre un chat de soporte</Link>
          </div>
        </form>
      </div>
    </main>
  );
}
