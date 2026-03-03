"use client";
import { X, ExternalLink, MapPin, CheckCircle, XCircle, TrendingDown, ShoppingBag, Palette } from "lucide-react";
import { Product } from "@/types";

interface PriceComparisonModalProps {
  product: Product;
  onClose: () => void;
  selectedColor?: string | null;
}

const storeColors: Record<string, string> = {
  "Sephora": "bg-black text-white",
  "Beleza na Web": "bg-pink-600 text-white",
  "Magazine Luiza": "bg-blue-600 text-white",
  "Mercado Livre": "bg-yellow-400 text-gray-900",
  "Americanas": "bg-red-600 text-white",
  "Boticário": "bg-purple-600 text-white",
};

export default function PriceComparisonModal({ product, onClose, selectedColor }: PriceComparisonModalProps) {
  const sorted = [...product.prices].sort((a, b) => a.price - b.price);
  const inStockPrices = sorted.filter((p) => p.inStock);
  const lowestInStock = inStockPrices[0];
  const highestInStock = inStockPrices[inStockPrices.length - 1];
  const savings = lowestInStock && highestInStock && inStockPrices.length > 1
    ? highestInStock.price - lowestInStock.price
    : 0;

  // Monta o termo de busca: nome do produto + cor selecionada (se houver)
  const searchTerm = selectedColor
    ? `${product.name} ${selectedColor}`
    : product.name;
  const mlSearchUrl = `https://www.mercadolivre.com.br/search?q=${encodeURIComponent(searchTerm)}`;
  const belezaSearchUrl = `https://www.belezanaweb.com.br/search?q=${encodeURIComponent(searchTerm)}`;
  const sephoraSearchUrl = `https://www.sephora.com.br/search#q=${encodeURIComponent(searchTerm)}`;

  const hasRealPrices = sorted.length > 0;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-500 to-teal-500 px-6 py-5 text-white">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <MapPin className="w-5 h-5" />
            <span className="font-bold text-lg">Onde Comprar</span>
          </div>
          <p className="text-emerald-100 text-sm line-clamp-1 pr-8">{product.name} – {product.brand}</p>
          {selectedColor && (
            <div className="flex items-center gap-1.5 mt-2 bg-white/15 rounded-full px-3 py-1 w-fit">
              <Palette className="w-3.5 h-3.5 text-emerald-100" />
              <span className="text-xs font-semibold text-white">Tom: {selectedColor}</span>
            </div>
          )}
        </div>

        {/* Savings banner */}
        {savings > 0 && (
          <div className="bg-emerald-50 border-b border-emerald-100 px-5 py-3 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-emerald-600 shrink-0" />
            <p className="text-sm text-emerald-700">
              Economize até{" "}
              <span className="font-bold">R$ {savings.toFixed(2).replace(".", ",")}</span>{" "}
              comprando na loja mais barata disponível!
            </p>
          </div>
        )}

        {/* Store list */}
        <div className="p-4 space-y-3 max-h-[420px] overflow-y-auto">
          {hasRealPrices ? (
            sorted.map((entry, idx) => {
              const isCheapest = entry.inStock && idx === sorted.findIndex((e) => e.inStock);
              const initials = entry.store.slice(0, 2).toUpperCase();
              const colorClass = storeColors[entry.store] ?? "bg-gray-700 text-white";

              return (
                <div
                  key={entry.store}
                  className={`rounded-xl border overflow-hidden transition-all ${
                    isCheapest ? "border-emerald-300 shadow-sm shadow-emerald-100" : "border-gray-100"
                  } ${!entry.inStock ? "opacity-60" : ""}`}
                >
                  <div className="flex items-center justify-between px-4 py-3 bg-white gap-3">
                    {/* Store identity */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${colorClass}`}>
                        {initials}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <p className="font-semibold text-gray-900 text-sm">{entry.store}</p>
                          {isCheapest && (
                            <span className="px-1.5 py-0.5 bg-emerald-500 text-white text-[10px] font-bold rounded-full leading-none">
                              MELHOR PREÇO
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 mt-0.5">
                          {entry.inStock ? (
                            <>
                              <CheckCircle className="w-3 h-3 text-emerald-500 shrink-0" />
                              <span className="text-xs text-emerald-600">Em estoque</span>
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3 h-3 text-gray-400 shrink-0" />
                              <span className="text-xs text-gray-400">Indisponível no momento</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Price */}
                    <div className="text-right shrink-0">
                      <p className={`text-xl font-extrabold ${isCheapest ? "text-emerald-700" : "text-gray-800"}`}>
                        R$ {entry.price.toFixed(2).replace(".", ",")}
                      </p>
                    </div>
                  </div>

                  {/* CTA row */}
                  {entry.inStock && (
                    <a
                      href={entry.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex items-center justify-center gap-2 w-full py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 ${
                        isCheapest
                          ? "bg-emerald-500 text-white"
                          : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                      }`}
                    >
                      <ShoppingBag className="w-4 h-4" />
                      Ir para {entry.store}
                      <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                    </a>
                  )}
                </div>
              );
            })
          ) : (
            /* Sem preços cadastrados — links de busca nas principais lojas */
            <div className="space-y-3">
              {selectedColor && (
                <p className="text-xs text-center text-gray-500 bg-pink-50 border border-pink-100 rounded-xl px-4 py-2">
                  Buscando o tom <span className="font-semibold text-pink-600">{selectedColor}</span> nas lojas
                </p>
              )}
              {[
                { store: "Mercado Livre", url: mlSearchUrl,    colorClass: "bg-yellow-400 text-gray-900" },
                { store: "Beleza na Web",  url: belezaSearchUrl, colorClass: "bg-pink-600 text-white"     },
                { store: "Sephora",        url: sephoraSearchUrl, colorClass: "bg-black text-white"        },
              ].map(({ store, url, colorClass }) => (
                <div key={store} className="rounded-xl border border-gray-100 overflow-hidden">
                  <div className="flex items-center gap-3 px-4 py-3">
                    <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-xs font-bold shrink-0 ${colorClass}`}>
                      {store.slice(0, 2).toUpperCase()}
                    </div>
                    <p className="font-semibold text-gray-900 text-sm flex-1">{store}</p>
                  </div>
                  <a
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 text-sm font-semibold transition-colors"
                  >
                    <ShoppingBag className="w-4 h-4" />
                    Buscar em {store}
                    <ExternalLink className="w-3.5 h-3.5 opacity-70" />
                  </a>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-4">
          {selectedColor && (
            <p className="text-[11px] text-pink-500 text-center mb-1 font-medium">
              Tom selecionado: {selectedColor} — a busca já inclui essa cor
            </p>
          )}
          <p className="text-[11px] text-gray-400 text-center leading-relaxed">
            Os preços são consultados periodicamente e podem sofrer alterações. Confira o valor final na página de cada loja.
          </p>
        </div>
      </div>
    </div>
  );
}
