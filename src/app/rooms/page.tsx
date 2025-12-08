import { getServerSession } from "next-auth";
import { authOptions } from "@/modules/auth/lib/auth";
import { prisma } from "@/modules/ui/lib/prisma";
import GameSelector from "@/modules/rooms/components/rooms/GameSelector";

export const dynamic = "force-dynamic";

export default async function RoomsPage() {
  const session = await getServerSession(authOptions);
  const user = session?.user as any;
  const isAdmin = user?.role === "admin" || user?.role === "god";

  const settings = await prisma.systemSettings.findFirst();
  const diceCover = settings?.diceCoverUrl || "/dice-cover.png";
  const rouletteCover = settings?.rouletteCoverUrl || "/roulette-cover.png";

  return (
    <main className="space-y-4">
      <h1 className="text-xl font-bold mb-4">Selecciona un Juego</h1>
      <GameSelector
        initialDiceCover={diceCover}
        initialRouletteCover={rouletteCover}
        isAdmin={isAdmin}
      />
    </main>
  );
}

