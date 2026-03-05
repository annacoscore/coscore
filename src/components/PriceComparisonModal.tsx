"use client";
import { useEffect, useState } from "react";
import {
  X, ExternalLink, ShoppingBag, TrendingDown,
  Loader2, RefreshCw, Tag, Truck, SearchX,
} from "lucide-react";
import { Product } from "@/types";
import type { StorePriceResult } from "@/app/api/prices/route";

interface PriceComparisonModalProps {
  product:       Product;
  onClose:       () => void;
  selectedColor?: string | null;
}

export default function PriceComparisonModal({
  product,
  onClose,
  selectedColor,
}: PriceComparisonModalProps) {
  const [results, setResults] = useState<StorePriceResult[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState(false);

  const fetchPrices = async () => {
    setLoading(true);
    setError(false);
    setResults([]);
    try {
      const params = new URLSearchParams({
        name:  product.name,
        brand: product.brand,
        ...(product.mlId  ? { mlId:  product.mlId  } : {}),
        ...(selectedColor ? { color: selectedColor  } : {}),
      });
      const res  = await fetch(`/api/prices?${params}`);
      const data = await res.json();
      setResults(data.results ?? []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchPrices(); }, [product.id, selectedColor]);

  const fmt = (v: number) =>
    v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

  const cheapest = results.length > 0
    ? results.reduce((a, b) => (a.price! < b.price! ? a : b))
    : null;
  const mostExp  = results.length > 1
    ? results.reduce((a, b) => (a.price! > b.price! ? a : b))
    : null;
  const savings  = cheapest && mostExp && cheapest.store !== mostExp.store
    ? mostExp.price! - cheapest.price!
    : 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white w-full sm:max-w-lg rounded-t-3xl sm:rounded-2xl shadow-2xl overflow-hidden max-h-[92vh] flex flex-col">

        {/* ── Header ── */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-600 px-5 pt-5 pb-4 text-white shrink-0">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>

          <div className="flex items-center gap-2 mb-1">
            <ShoppingBag className="w-5 h-5" />
            <span className="font-bold text-lg">Comparar Preços</span>
          </div>
          <p className="text-emerald-100 text-sm pr-8 leading-snug line-clamp-2">
            {product.brand} — {product.name}
          </p>
          {selectedColor && (
            <span className="inline-flex items-center gap-1 mt-2 bg-white/20 text-white text-xs font-semibold px-3 py-1 rounded-full">
              <Tag className="w-3 h-3" /> Tom: {selectedColor}
            </span>
          )}
        </div>

        {/* ── Conteúdo ── */}
        <div className="overflow-y-auto flex-1 px-4 py-4 space-y-3">

          {/* Loading */}
          {loading && (
            <div className="flex flex-col items-center justify-center py-14 gap-3">
              <Loader2 className="w-8 h-8 text-emerald-500 animate-spin" />
              <p className="text-sm text-gray-500 font-medium">
                Consultando preços em tempo real...
              </p>
            </div>
          )}

          {/* Erro */}
          {error && !loading && (
            <div className="text-center py-10">
              <p className="text-gray-500 text-sm mb-3">
                Não foi possível carregar os preços agora.
              </p>
              <button
                onClick={fetchPrices}
                className="flex items-center gap-2 mx-auto text-sm text-emerald-600 font-medium hover:underline"
              >
                <RefreshCw className="w-4 h-4" /> Tentar novamente
              </button>
            </div>
          )}

          {!loading && !error && (
            <>
              {/* Banner de economia */}
              {savings > 0.5 && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5">
                  <TrendingDown className="w-4 h-4 text-emerald-600 shrink-0" />
                  <p className="text-sm text-emerald-700">
                    Economize até{" "}
                    <span className="font-bold">{fmt(savings)}</span>{" "}
                    comprando na loja mais barata!
                  </p>
                </div>
              )}

              {/* Lista de lojas com preço */}
              {results.length > 0 ? (
                <div className="space-y-2">
                  {results.map((item, idx) => {
                    const isCheapest = item.store === cheapest?.store && results.length > 1;
                    return (
                      <a
                        key={item.store + idx}
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`flex items-center gap-3 p-3.5 rounded-xl border transition-all hover:shadow-md group ${
                          isCheapest
                            ? "border-emerald-300 bg-emerald-50 hover:border-emerald-400"
                            : "border-gray-100 bg-white hover:border-gray-200"
                        }`}
                      >
                        {/* Logo */}
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xs font-bold shrink-0 ${item.color}`}>
                          {item.logo}
                        </div>

                        {/* Nome + badge */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="text-sm font-semibold text-gray-900">{item.store}</p>
                            {isCheapest && (
                              <span className="text-[10px] font-bold bg-emerald-500 text-white px-1.5 py-0.5 rounded-full leading-none">
                                MAIS BARATO
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-400">Em estoque</p>
                            {item.freeShipping && (
                              <span className="flex items-center gap-0.5 text-[10px] text-emerald-600 font-semibold">
                                <Truck className="w-3 h-3" /> Frete grátis
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Preço + CTA */}
                        <div className="text-right shrink-0">
                          <p className={`text-xl font-extrabold ${isCheapest ? "text-emerald-700" : "text-gray-800"}`}>
                            {fmt(item.price!)}
                          </p>
                          <span className="inline-flex items-center gap-0.5 text-xs text-emerald-600 font-medium group-hover:underline mt-0.5">
                            Comprar <ExternalLink className="w-3 h-3" />
                          </span>
                        </div>
                      </a>
                    );
                  })}
                </div>
              ) : (
                /* Nenhum resultado */
                <div className="text-center py-12 flex flex-col items-center gap-3 text-gray-400">
                  <SearchX className="w-10 h-10 text-gray-300" />
                  <div>
                    <p className="text-sm font-medium text-gray-600">
                      Produto não encontrado nas lojas
                    </p>
                    <p className="text-xs text-gray-400 mt-1">
                      Este produto pode não estar disponível para venda online no momento.
                    </p>
                  </div>
                  <a
                    href={`https://www.mercadolivre.com.br/search?q=${encodeURIComponent([product.brand, product.name].filter(Boolean).join(" "))}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 mt-1 text-sm text-emerald-600 font-semibold hover:underline"
                  >
                    Buscar no Mercado Livre <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              )}
            </>
          )}
        </div>

        {/* ── Rodapé ── */}
        {!loading && results.length > 0 && (
          <div className="px-5 py-3 border-t border-gray-100 bg-gray-50/80 shrink-0">
            <p className="text-[11px] text-gray-400 text-center leading-relaxed">
              Preços consultados em tempo real · {results.length} {results.length === 1 ? "loja encontrada" : "lojas encontradas"} · Verifique o valor final antes de comprar.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
