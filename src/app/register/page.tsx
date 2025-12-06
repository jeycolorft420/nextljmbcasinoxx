// src/app/register/page.tsx
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch("/api/auth/register/route", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (res.ok) {
        setMessage(data.message);
        // Optionally redirect to verification page after a short delay
        setTimeout(() => router.push("/verification"), 3000);
      } else {
        setMessage(data.error || "Error al registrar");
      }
    } catch (err) {
      console.error(err);
      setMessage("Error de red");
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md w-full bg-card p-8 rounded-2xl border border-white/10">
        <h1 className="text-2xl font-bold mb-4 text-center">Registro</h1>
        {message ? (
          <p className="text-center text-green-400">{message}</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="email">Correo</label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full rounded-md border bg-background p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="password">Contraseña</label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full rounded-md border bg-background p-2"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="name">Nombre (opcional)</label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full rounded-md border bg-background p-2"
              />
            </div>
            <button
              type="submit"
              className="w-full btn btn-primary mt-2"
            >
              Registrarse
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
