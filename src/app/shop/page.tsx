"use client";

import { useEffect, useState } from "react";
import { useWallet } from "@/hooks/use-wallet";

type ShopState = {
  balanceCents: number;
  owned: string[];
  selected: string | null;
  priceCents: number;
  priceMap?: Record<string, number>;
  allowed?: string[]; // Legacy (Dice)
  skins?: Record<string, { price: number; name: string }>; // New (Roulette)
};

const DICE_META: Record<string, { label: string; sampleBg: string; pip: string }> = {
  green: { label: "Verde", sampleBg: "from-emerald-300 to-emerald-600", pip: "bg-emerald-900/90" },
  blue: { label: "Azul", sampleBg: "from-blue-300 to-blue-600", pip: "bg-blue-900/90" },
  yellow: { label: "Amarillo", sampleBg: "from-yellow-300 to-amber-500", pip: "bg-amber-900/90" },
  red: { label: "Rojo", sampleBg: "from-rose-300 to-rose-600", pip: "bg-rose-900/90" },
  purple: { label: "Morado", sampleBg: "from-fuchsia-300 to-violet-600", pip: "bg-violet-900/90" },
  pink: { label: "Rosado", sampleBg: "from-pink-300 to-pink-600", pip: "bg-pink-900/90" },
};

const ROULETTE_META: Record<string, { label: string; sampleBg: string }> = {
  "default": { label: "Default", sampleBg: "from-gray-700 to-gray-900" },
  "classic": { label: "Classic", sampleBg: "from-red-600 to-black" },
  "vip": { label: "VIP Gold", sampleBg: "from-yellow-400 to-yellow-700" },
  "cyberpunk": { label: "Cyberpunk", sampleBg: "from-pink-500 to-blue-500" },
  "matrix": { label: "Matrix", sampleBg: "from-green-500 to-black" },
};

const fmtUSD = (c: number) => `$${(c / 100).toFixed(2)}`;

export default function ShopPage() {
  const { balanceCents, refreshBalance } = useWallet();
  const [activeTab, setActiveTab] = useState<"dice" | "roulette">("dice");
  const [state, setState] = useState<ShopState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const endpoint = activeTab === "dice" ? "/api/shop/buy-skin" : "/api/shop/roulette";

  const load = async () => {
    setLoading(true);
    try {
      const r = await fetch(endpoint, { cache: "no-store" });
      const d = await r.json();
      if (r.ok) setState(d);
      else alert(d.error || "Error cargando tienda");
    } catch {
      alert("Error de red");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [activeTab]);

  const buy = async (id: string) => {
    if (!state) return;
    setBusy(id);
    try {
      const payload = activeTab === "dice" ? { color: id } : { skinId: id };
      const r = await fetch(endpoint, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || "No se pudo comprar");
      } else {
        await load();
        refreshBalance(); // Update global balance
      }
    } finally {
      setBusy(null);
    }
  };

  const equip = async (id: string) => {
    if (!state) return;
    setBusy(id);
    try {
      const payload = activeTab === "dice" ? { color: id } : { skinId: id };
      const r = await fetch(endpoint, {
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload),
      });
      const d = await r.json();
      if (!r.ok) {
        alert(d.error || "No se pudo equipar");
      } else {
        await load();
        refreshBalance(); // Update skin in globals
      }
    } finally {
      setBusy(null);
    }
  };

  return (
    <main className="max-w-5xl mx-auto px-3 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Tienda</h1>
        <div className="text-sm opacity-80 bg-white/5 px-3 py-1 rounded-full border border-white/10">
          Saldo: <strong>{balanceCents !== null ? fmtUSD(balanceCents) : "..."}</strong>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 border-b border-white/10">
        <button
          onClick={() => setActiveTab("dice")}
          className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === "dice" ? "text-white border-b-2 border-orange-500" : "text-gray-400 hover:text-white"
            }`}
        >
          Dados
        </button>
        <button
          onClick={() => setActiveTab("roulette")}
          className={`pb-2 px-4 text-sm font-medium transition-colors ${activeTab === "roulette" ? "text-white border-b-2 border-orange-500" : "text-gray-400 hover:text-white"
            }`}
        >
          Ruleta
        </button>
      </div>

      {loading && <div className="text-center py-10 opacity-50">Cargando ítems...</div>}

      {!loading && state && (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-4">
          {activeTab === "dice" ? (
            state.allowed?.map((c) => {
              const owned = state.owned.includes(c);
              const selected = state.selected === c;
              const meta = DICE_META[c];
              const price = state.priceMap?.[c] ?? state.priceCents;
              return (
                <ItemCard
                  key={c}
                  id={c}
                  name={meta?.label || c}
                  price={price}
                  owned={owned}
                  selected={selected}
                  busy={busy === c}
                  onBuy={() => buy(c)}
                  onEquip={() => equip(c)}
                >
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${meta?.sampleBg} shadow-lg grid place-items-center`}>
                    <div className={`w-3.5 h-3.5 rounded-full ${meta?.pip}`} />
                  </div>
                </ItemCard>
              );
            })
          ) : (
            Object.entries(state.skins || {}).map(([id, info]) => {
              const owned = state.owned.includes(id);
              const selected = state.selected === id;
              const meta = ROULETTE_META[id] || { label: info.name, sampleBg: "bg-gray-800" };
              return (
                <ItemCard
                  key={id}
                  id={id}
                  name={info.name}
                  price={info.price}
                  owned={owned}
                  selected={selected}
                  busy={busy === id}
                  onBuy={() => buy(id)}
                  onEquip={() => equip(id)}
                >
                  <div className={`w-20 h-20 rounded-full border-4 border-white/10 bg-gradient-to-br ${meta?.sampleBg} shadow-xl flex items-center justify-center`}>
                    <div className="w-2 h-2 rounded-full bg-white/50" />
                  </div>
                </ItemCard>
              );
            })
          )}
        </div>
      )}
    </main>
  );
}

function ItemCard({ id, name, price, owned, selected, busy, onBuy, onEquip, children }: any) {
  return (
    <div className="rounded-xl border border-white/10 p-4 bg-white/5 flex flex-col items-center text-center">
      <div className="font-semibold mb-3">{name}</div>
      <div className="mb-4">{children}</div>

      <div className="mt-auto w-full">
        {owned ? (
          <button
            onClick={onEquip}
            disabled={busy || selected}
            className={`btn btn-sm w-full ${selected ? "btn-disabled opacity-50 cursor-default" : "btn-outline"}`}
          >
            {busy ? "..." : selected ? "En uso" : "Usar"}
          </button>
        ) : (
          <button
            onClick={onBuy}
            disabled={busy}
            className="btn btn-primary btn-sm w-full"
          >
            {busy ? "..." : `Comprar ${fmtUSD(price)}`}
          </button>
        )}
      </div>
    </div>
  );
}
