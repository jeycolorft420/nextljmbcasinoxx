"use client";
import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

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
    <main className="min-h-screen flex items-center justify-center p-6">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 border p-6 rounded-xl">
        <h1 className="text-2xl font-semibold">Iniciar sesión</h1>
        <input className="w-full border p-2 rounded" placeholder="Email" type="email"
               value={email} onChange={(e)=>setEmail(e.target.value)} required />
        <input className="w-full border p-2 rounded" placeholder="Contraseña" type="password"
               value={password} onChange={(e)=>setPassword(e.target.value)} required />
        <button disabled={loading} className="w-full border p-2 rounded font-medium">
          {loading ? "Entrando..." : "Entrar"}
        </button>
        <p className="text-sm">¿Aún no tienes cuenta? <a className="underline" href="/register">Regístrate</a></p>
      </form>
    </main>
  );
}
