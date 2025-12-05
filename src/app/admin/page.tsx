// src/app/admin/page.tsx
import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  const role = (session?.user as any)?.role;

  // Solo admins
  if (role !== "admin") redirect("/");

  const cards = [
    {
      href: "/admin/rooms",
      title: "Salas",
      desc: "Crear y gestionar salas, ver ocupación y estados.",
    },
    {
      href: "/admin/withdrawals",
      title: "Retiros",
      desc: "Aprobar o rechazar retiros de usuarios en tiempo real.",
    },
    {
      href: "/admin/support",
      title: "Soporte",
      desc: "Respondé consultas, tickets o reportes de usuarios.",
    },
    // Si luego agregas más secciones, solo suma aquí.
  ];

  return (
    <main className="max-w-5xl mx-auto p-4 space-y-6">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold">Panel de Administración</h1>
        <p className="text-sm opacity-80">
          Accesos rápidos a todas las herramientas de administrador.
        </p>
      </header>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Link
            key={c.href}
            href={c.href}
            className="card group border rounded-xl p-4 hover:bg-white/5 transition"
          >
            <h2 className="font-semibold text-base mb-1 group-hover:underline">
              {c.title}
            </h2>
            <p className="text-sm opacity-80">{c.desc}</p>
          </Link>
        ))}
      </section>
    </main>
  );
}
