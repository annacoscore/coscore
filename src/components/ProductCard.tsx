"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { Heart, MessageCircle, Check, X, Plus, FolderHeart, ListPlus } from "lucide-react";
import { Product, getCategoryDisplayName } from "@/types";
import { useStore } from "@/store/useStore";
import StarRating from "./StarRating";

interface ProductCardProps {
  product: Product;
}

export default function ProductCard({ product }: ProductCardProps) {
  const { currentUser, isFavorite, getUserLists, isInList, addToList, removeFromList, createList, openLoginModal } =
    useStore();

  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const favorite = isFavorite(product.id);
  const lists = getUserLists();

  const inStockPrices = product.prices.filter((p) => p.inStock);
  const lowestPrice = inStockPrices.length > 0 ? Math.min(...inStockPrices.map((p) => p.price)) : null;
  const imageSrc = product.image || `https://picsum.photos/seed/${product.id}/400/400`;

  useEffect(() => {
    if (!popoverOpen) { setCreatingList(false); setNewListName(""); }
  }, [popoverOpen]);

  useEffect(() => {
    if (creatingList) inputRef.current?.focus();
  }, [creatingList]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setPopoverOpen(false);
      }
    };
    if (popoverOpen) document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [popoverOpen]);

  const handleHeartClick = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!currentUser) {
      openLoginModal("Faça login para salvar produtos nos seus favoritos.");
      return;
    }
    setPopoverOpen(!popoverOpen);
  };

  const toggleList = (e: React.MouseEvent, listId: string) => {
    e.preventDefault();
    e.stopPropagation();
    if (isInList(product.id, listId)) {
      removeFromList(product.id, listId);
    } else {
      addToList(product.id, listId);
    }
  };

  const handleCreateList = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!newListName.trim()) return;
    const list = createList(newListName);
    if (list) addToList(product.id, list.id);
    setNewListName("");
    setCreatingList(false);
  };

  return (
    <Link href={`/produto/${product.id}`} className="group block">
      <div className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all duration-200 border border-pink-50 group-hover:border-pink-200">
        {/* Image */}
        <div className="relative aspect-square bg-white overflow-hidden">
          <Image
            src={imageSrc}
            alt={product.name}
            fill
            className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />

          {/* Heart / Save button */}
          <div className="absolute top-2.5 right-2.5" ref={popoverRef}>
            <button
              onClick={handleHeartClick}
              className={`p-2 rounded-full shadow-sm transition-all hover:scale-110 ${
                favorite ? "bg-pink-500" : "bg-white/90 backdrop-blur-sm"
              }`}
            >
              <Heart
                className={`w-4 h-4 transition-colors ${
                  favorite ? "fill-white text-white" : "text-gray-400"
                }`}
              />
            </button>

            {/* Popover */}
            {popoverOpen && (
              <div
                className="absolute top-full right-0 mt-1.5 w-52 bg-white rounded-xl shadow-xl border border-gray-100 overflow-hidden z-30"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); }}
              >
                <div className="flex items-center gap-2 px-3 py-2.5 border-b border-gray-100">
                  <ListPlus className="w-3.5 h-3.5 text-pink-500" />
                  <p className="text-xs font-semibold text-gray-700">Salvar em lista</p>
                  <button
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPopoverOpen(false); }}
                    className="ml-auto text-gray-400 hover:text-gray-600"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>

                <div className="max-h-48 overflow-y-auto py-1">
                  {lists.map((list) => {
                    const inList = isInList(product.id, list.id);
                    return (
                      <button
                        key={list.id}
                        onClick={(e) => toggleList(e, list.id)}
                        className="flex items-center justify-between w-full px-3 py-2 hover:bg-gray-50 transition-colors"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <FolderHeart className={`w-3.5 h-3.5 shrink-0 ${inList ? "text-pink-500" : "text-gray-400"}`} />
                          <span className={`text-sm truncate ${inList ? "text-pink-700 font-medium" : "text-gray-700"}`}>
                            {list.name}
                          </span>
                        </div>
                        {inList && <Check className="w-3.5 h-3.5 text-pink-500 shrink-0" />}
                      </button>
                    );
                  })}
                </div>

                <div className="border-t border-gray-100">
                  {creatingList ? (
                    <div className="flex gap-1.5 p-2">
                      <input
                        ref={inputRef}
                        type="text"
                        value={newListName}
                        onChange={(e) => setNewListName(e.target.value)}
                        onKeyDown={(e) => {
                          e.stopPropagation();
                          if (e.key === "Enter") handleCreateList(e as unknown as React.MouseEvent);
                          if (e.key === "Escape") setCreatingList(false);
                        }}
                        onClick={(e) => e.stopPropagation()}
                        placeholder="Nome da lista..."
                        maxLength={40}
                        className="flex-1 px-2.5 py-1.5 text-xs border border-pink-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200 min-w-0"
                      />
                      <button
                        onClick={handleCreateList}
                        disabled={!newListName.trim()}
                        className="p-1.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-colors shrink-0"
                      >
                        <Check className="w-3 h-3" />
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setCreatingList(true); }}
                      className="flex items-center gap-2 w-full px-3 py-2.5 text-xs text-pink-600 font-medium hover:bg-pink-50 transition-colors"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Nova lista
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Category badge */}
          <span className="absolute top-2.5 left-2.5 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-gray-600">
            {getCategoryDisplayName(product.category)}
          </span>
        </div>

        {/* Content */}
        <div className="p-3.5">
          <p className="text-xs text-pink-500 font-semibold uppercase tracking-wide mb-0.5">
            {product.brand}
          </p>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 mb-2">
            {product.name}
          </h3>

          <div className="flex items-center gap-1.5 mb-2">
            <StarRating rating={product.averageRating} size="sm" />
            <span className="text-xs font-bold text-gray-700">{product.averageRating.toFixed(1)}</span>
            <span className="text-xs text-gray-400 flex items-center gap-0.5">
              <MessageCircle className="w-3 h-3" />
              {product.reviewCount}
            </span>
          </div>

          {/* Cores disponíveis */}
          {product.colors && product.colors.length > 1 && (
            <p className="text-xs text-pink-500 font-medium">
              {product.colors.length} cores disponíveis
            </p>
          )}

          <div className="flex items-center justify-between">
            <div>
              {lowestPrice !== null ? (
                <>
                  <p className="text-xs text-gray-400">A partir de</p>
                  <p className="text-base font-bold text-gray-900">
                    R$ {lowestPrice.toFixed(2).replace(".", ",")}
                  </p>
                </>
              ) : (
                <p className="text-sm font-medium text-gray-400">Ver preços</p>
              )}
            </div>
            <span className="text-xs text-gray-400 bg-gray-50 px-2 py-1 rounded-full">
              {product.prices.length > 0 ? `${product.prices.length} lojas` : "—"}
            </span>
          </div>
        </div>
      </div>
    </Link>
  );
}
