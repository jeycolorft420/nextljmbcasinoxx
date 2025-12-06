import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { redirect } from "next/navigation";
import Link from "next/link";

const TIERS = [100, 500, 1000, 2000, 5000, 10000];

export default async function AdminRoomsPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;

  if (user?.role !== "admin" && user?.role !== "god") {
    redirect("/");
  }

  const settings = await prisma.systemSettings.findFirst();
  const diceCover = settings?.diceCoverUrl || "/dice-cover.png";
  const rouletteCover = settings?.rouletteCoverUrl || "/roulette-cover.png";

  return (
    <main className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Administrar Salas</h1>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
        {/* Dice Card */}
        <Link href="/admin/rooms/dice" className="group relative overflow-hidden rounded-2xl border-2 border-white/10 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all duration-300 h-64">
          <div
            className="absolute inset-0 bg-cover bg-center transition-transform duration-500 group-hover:scale-110"
            style={{ backgroundImage: `url('${diceCover}')` }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          <div className="absolute bottom-0 left-0 p-6 text-left w-full">
            <h3 className="text-3xl font-bold mb-2 text-white group-hover:text-primary transition-colors">
              Dados
            </h3>
            <p className="text-sm text-slate-300">
              Administrar salas de Dados 1v1
            </p>
          </div>
        </Link>

        {/* Roulette Card */}
        <Link href="/admin/rooms/roulette" className="group relative overflow-hidden rounded-2xl border-2 border-white/10 hover:border-primary/50 hover:shadow-[0_0_30px_rgba(16,185,129,0.2)] transition-all duration-300 h-64">
          <div
            className="absolute inset-0 bg-cover transition-transform duration-500 group-hover:scale-110"
            style={{
              backgroundImage: `url('${rouletteCover}')`,
              backgroundPosition: "center 65%"
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/40 to-transparent" />

          <div className="absolute bottom-0 left-0 p-6 text-left w-full">
            <h3 className="text-3xl font-bold mb-2 text-white group-hover:text-primary transition-colors">
              Ruleta
            </h3>
            <p className="text-sm text-slate-300">
              Administrar salas de Ruleta Multijugador
            </p>
          </div>
        </Link>
      </div>

      {/* Quick Create Actions */}
      <div className="card p-6 space-y-4">
        <h2 className="font-bold text-lg">Creación Rápida</h2>

        <div className="space-y-4">
          <div>
            <p className="text-sm opacity-70 mb-2">Crear Ruleta:</p>
            <div className="flex flex-wrap gap-2">
              {TIERS.map((p) => (
                <CreateRoomButton key={`r-${p}`} price={p} type="ROULETTE" label={`Ruleta $${p / 100}`} />
              ))}
            </div>
          </div>

          <div>
            <p className="text-sm opacity-70 mb-2">Crear Dados:</p>
            <div className="flex flex-wrap gap-2">
              {TIERS.map((p) => (
                <CreateRoomButton key={`d-${p}`} price={p} type="DICE_DUEL" label={`Dados $${p / 100}`} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

// Client component for the button to handle onClick
import CreateRoomButton from "@/components/admin/CreateRoomButton";
