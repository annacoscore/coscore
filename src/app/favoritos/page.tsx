"use client";
import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  Heart,
  LogIn,
  Plus,
  Pencil,
  Trash2,
  Check,
  X,
  ChevronRight,
  ListPlus,
  Star,
  ShoppingCart,
  MoreVertical,
  FolderHeart,
} from "lucide-react";
import { useStore } from "@/store/useStore";
import { products } from "@/data/products";
import { FavoriteList } from "@/types";
import StarRating from "@/components/StarRating";

/* ─── Small modal to add a product to a list ───────────────────── */
function AddToListModal({
  productId,
  onClose,
}: {
  productId: string;
  onClose: () => void;
}) {
  const { getUserLists, isInList, addToList, removeFromList, createList } = useStore();
  const lists = getUserLists();
  const [newListName, setNewListName] = useState("");
  const [creating, setCreating] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const handleCreate = () => {
    if (!newListName.trim()) return;
    const list = createList(newListName);
    if (list) addToList(productId, list.id);
    setNewListName("");
    setCreating(false);
  };

  const toggle = (listId: string) => {
    if (isInList(productId, listId)) {
      removeFromList(productId, listId);
    } else {
      addToList(productId, listId);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-xs overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <h3 className="font-bold text-gray-900 flex items-center gap-2">
            <ListPlus className="w-4 h-4 text-pink-500" />
            Salvar em lista
          </h3>
          <button onClick={onClose} className="p-1 rounded-full hover:bg-gray-100">
            <X className="w-4 h-4 text-gray-400" />
          </button>
        </div>

        <div className="p-3 space-y-1.5 max-h-64 overflow-y-auto">
          {lists.map((list) => {
            const inList = isInList(productId, list.id);
            return (
              <button
                key={list.id}
                onClick={() => toggle(list.id)}
                className={`w-full flex items-center justify-between px-4 py-3 rounded-xl transition-colors text-left ${
                  inList ? "bg-pink-50 border border-pink-200" : "hover:bg-gray-50 border border-transparent"
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <FolderHeart className={`w-4 h-4 ${inList ? "text-pink-500" : "text-gray-400"}`} />
                  <span className={`text-sm font-medium ${inList ? "text-pink-700" : "text-gray-700"}`}>
                    {list.name}
                  </span>
                  <span className="text-xs text-gray-400">{list.productIds.length}</span>
                </div>
                {inList && <Check className="w-4 h-4 text-pink-500 shrink-0" />}
              </button>
            );
          })}
        </div>

        <div className="px-3 pb-3 border-t border-gray-100 pt-3">
          {creating ? (
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={newListName}
                onChange={(e) => setNewListName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleCreate()}
                placeholder="Nome da nova lista"
                maxLength={40}
                className="flex-1 px-3 py-2 text-sm border border-pink-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200"
              />
              <button
                onClick={handleCreate}
                disabled={!newListName.trim()}
                className="px-3 py-2 bg-pink-500 text-white rounded-xl text-sm font-medium hover:bg-pink-600 disabled:opacity-50 transition-colors"
              >
                <Check className="w-4 h-4" />
              </button>
              <button
                onClick={() => setCreating(false)}
                className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-sm hover:bg-gray-200 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreating(true)}
              className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-pink-600 font-medium hover:bg-pink-50 rounded-xl transition-colors"
            >
              <Plus className="w-4 h-4" />
              Criar nova lista
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/* ─── Product card inside favorites ────────────────────────────── */
function FavoriteProductCard({
  productId,
  activeListId,
}: {
  productId: string;
  activeListId: string;
}) {
  const { removeFromList, getUserLists, isInList, addToList } = useStore();
  const [menuOpen, setMenuOpen] = useState(false);
  const [addListOpen, setAddListOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const product = products.find((p) => p.id === productId);
  if (!product) return null;

  const inStockPrices = product.prices.filter((p) => p.inStock);
  const lowestPrice = inStockPrices.length > 0 ? Math.min(...inStockPrices.map((p) => p.price)) : null;
  const otherLists = getUserLists().filter(
    (l) => l.id !== activeListId && !isInList(productId, l.id)
  );

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:border-pink-200 hover:shadow-sm transition-all group">
        {/* Image */}
        <Link href={`/produto/${product.id}`} className="block relative aspect-square overflow-hidden bg-white">
          <Image
            src={product.image}
            alt={product.name}
            fill
            className="object-contain p-2 group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 33vw, 25vw"
          />
          <span className="absolute top-2 left-2 px-2 py-0.5 bg-white/90 backdrop-blur-sm rounded-full text-xs font-medium text-gray-600">
            {product.category}
          </span>
        </Link>

        {/* Content */}
        <div className="p-3.5">
          <p className="text-xs text-pink-500 font-semibold uppercase tracking-wide mb-0.5">{product.brand}</p>
          <Link href={`/produto/${product.id}`}>
            <h3 className="font-semibold text-gray-900 text-sm leading-tight line-clamp-2 mb-2 hover:text-pink-600 transition-colors">
              {product.name}
            </h3>
          </Link>

          <div className="flex items-center gap-1.5 mb-2">
            <StarRating rating={product.averageRating} size="sm" />
            <span className="text-xs font-bold text-gray-700">{product.averageRating.toFixed(1)}</span>
          </div>

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
                <p className="text-sm text-gray-400">Ver preços</p>
              )}
            </div>

            {/* Action menu */}
            <div className="relative" ref={menuRef}>
              <button
                onClick={() => setMenuOpen(!menuOpen)}
                className="p-1.5 rounded-full hover:bg-gray-100 transition-colors"
              >
                <MoreVertical className="w-4 h-4 text-gray-400" />
              </button>

              {menuOpen && (
                <div className="absolute bottom-full right-0 mb-1 w-52 bg-white rounded-xl shadow-lg border border-gray-100 overflow-hidden z-20 py-1">
                  <Link
                    href={`/produto/${product.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <Star className="w-4 h-4 text-amber-400" />
                    Ver produto
                  </Link>

                  <Link
                    href={`/produto/${product.id}`}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50"
                    onClick={() => setMenuOpen(false)}
                  >
                    <ShoppingCart className="w-4 h-4 text-emerald-500" />
                    Onde comprar
                  </Link>

                  {otherLists.length > 0 && (
                    <>
                      <div className="h-px bg-gray-100 my-1" />
                      <p className="px-4 py-1 text-xs text-gray-400 font-medium">Adicionar a</p>
                      {otherLists.map((list) => (
                        <button
                          key={list.id}
                          onClick={() => { addToList(productId, list.id); setMenuOpen(false); }}
                          className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                        >
                          <FolderHeart className="w-4 h-4 text-pink-400" />
                          {list.name}
                        </button>
                      ))}
                    </>
                  )}

                  <div className="h-px bg-gray-100 my-1" />
                  <button
                    onClick={() => { setAddListOpen(true); setMenuOpen(false); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-700 hover:bg-gray-50 w-full text-left"
                  >
                    <ListPlus className="w-4 h-4 text-blue-400" />
                    Gerenciar listas
                  </button>
                  <button
                    onClick={() => { removeFromList(productId, activeListId); setMenuOpen(false); }}
                    className="flex items-center gap-2.5 px-4 py-2.5 text-sm text-red-500 hover:bg-red-50 w-full text-left"
                  >
                    <Trash2 className="w-4 h-4" />
                    Remover desta lista
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {addListOpen && (
        <AddToListModal productId={productId} onClose={() => setAddListOpen(false)} />
      )}
    </>
  );
}

/* ─── Main page ─────────────────────────────────────────────────── */
export default function FavoritosPage() {
  const { currentUser, getUserLists, createList, deleteList, renameList, openLoginModal } = useStore();

  const [activeListId, setActiveListId] = useState<string>("default");
  const [newListName, setNewListName] = useState("");
  const [creatingList, setCreatingList] = useState(false);
  const [editingListId, setEditingListId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [deletingListId, setDeletingListId] = useState<string | null>(null);
  const createInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);

  const lists = getUserLists();
  const activeList = lists.find((l) => l.id === activeListId) ?? lists[0];

  useEffect(() => {
    if (creatingList) createInputRef.current?.focus();
  }, [creatingList]);
  useEffect(() => {
    if (editingListId) editInputRef.current?.focus();
  }, [editingListId]);
  // Reset active list if it no longer exists
  useEffect(() => {
    if (lists.length > 0 && !lists.find((l) => l.id === activeListId)) {
      setActiveListId(lists[0].id);
    }
  }, [lists, activeListId]);

  if (!currentUser) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <Heart className="w-10 h-10 text-pink-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Meus Favoritos</h1>
          <p className="text-gray-500 mb-6">
            Faça login para criar listas e salvar seus produtos favoritos.
          </p>
          <button
            onClick={() => openLoginModal("Faça login para acessar seus favoritos.")}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-3 rounded-full font-semibold hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            Entrar / Criar Conta
          </button>
        </div>
      </div>
    );
  }

  const handleCreateList = () => {
    if (!newListName.trim()) return;
    const list = createList(newListName);
    if (list) {
      setActiveListId(list.id);
      setNewListName("");
      setCreatingList(false);
    }
  };

  const handleRename = (listId: string) => {
    if (!editingName.trim()) { setEditingListId(null); return; }
    renameList(listId, editingName);
    setEditingListId(null);
  };

  const handleDelete = (listId: string) => {
    deleteList(listId);
    setDeletingListId(null);
    if (activeListId === listId) setActiveListId("default");
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Page header */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-pink-100 rounded-full flex items-center justify-center">
          <Heart className="w-5 h-5 text-pink-500 fill-pink-500" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meus Favoritos</h1>
          <p className="text-sm text-gray-500">
            {lists.reduce((sum, l) => sum + l.productIds.length, 0)} produto{lists.reduce((s, l) => s + l.productIds.length, 0) !== 1 ? "s" : ""} em {lists.length} lista{lists.length !== 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* ── Sidebar: Lists ── */}
        <aside className="w-full lg:w-64 shrink-0">
          <div className="bg-white rounded-2xl border border-pink-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
              <p className="font-semibold text-gray-800 text-sm">Minhas Listas</p>
              <button
                onClick={() => setCreatingList(true)}
                className="p-1.5 rounded-full bg-pink-50 hover:bg-pink-100 text-pink-500 transition-colors"
                title="Nova lista"
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Create new list input */}
            {creatingList && (
              <div className="px-3 py-2.5 border-b border-gray-100 bg-pink-50/50">
                <div className="flex gap-2">
                  <input
                    ref={createInputRef}
                    type="text"
                    value={newListName}
                    onChange={(e) => setNewListName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreateList(); if (e.key === "Escape") setCreatingList(false); }}
                    placeholder="Nome da lista..."
                    maxLength={40}
                    className="flex-1 px-3 py-1.5 text-sm border border-pink-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200 bg-white"
                  />
                  <button onClick={handleCreateList} disabled={!newListName.trim()} className="p-1.5 bg-pink-500 text-white rounded-lg hover:bg-pink-600 disabled:opacity-50 transition-colors">
                    <Check className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => { setCreatingList(false); setNewListName(""); }} className="p-1.5 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}

            {/* List items */}
            <nav className="py-1">
              {lists.map((list) => {
                const isActive = list.id === activeListId;
                const isEditing = editingListId === list.id;

                return (
                  <div key={list.id} className={`group relative ${isActive ? "bg-pink-50" : "hover:bg-gray-50"} transition-colors`}>
                    {isEditing ? (
                      <div className="flex gap-1.5 px-3 py-2">
                        <input
                          ref={editInputRef}
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          onKeyDown={(e) => { if (e.key === "Enter") handleRename(list.id); if (e.key === "Escape") setEditingListId(null); }}
                          maxLength={40}
                          className="flex-1 px-2 py-1 text-sm border border-pink-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-pink-200"
                        />
                        <button onClick={() => handleRename(list.id)} className="p-1 bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors">
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button onClick={() => setEditingListId(null)} className="p-1 bg-gray-200 text-gray-600 rounded-lg hover:bg-gray-300 transition-colors">
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setActiveListId(list.id)}
                        className="w-full flex items-center justify-between px-4 py-3 text-left"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <FolderHeart className={`w-4 h-4 shrink-0 ${isActive ? "text-pink-500" : "text-gray-400"}`} />
                          <span className={`text-sm font-medium truncate ${isActive ? "text-pink-700" : "text-gray-700"}`}>
                            {list.name}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${isActive ? "bg-pink-200 text-pink-700" : "bg-gray-100 text-gray-500"}`}>
                            {list.productIds.length}
                          </span>
                          {isActive && <ChevronRight className="w-3.5 h-3.5 text-pink-400" />}
                        </div>
                      </button>
                    )}

                    {/* Edit/delete actions on hover */}
                    {!isEditing && !list.isDefault && (
                      <div className="absolute right-8 top-1/2 -translate-y-1/2 hidden group-hover:flex gap-0.5">
                        <button
                          onClick={(e) => { e.stopPropagation(); setEditingListId(list.id); setEditingName(list.name); }}
                          className="p-1 rounded hover:bg-white hover:shadow text-gray-400 hover:text-blue-500 transition-all"
                          title="Renomear"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeletingListId(list.id); }}
                          className="p-1 rounded hover:bg-white hover:shadow text-gray-400 hover:text-red-500 transition-all"
                          title="Excluir"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </nav>

            {/* Create list button at bottom */}
            {!creatingList && (
              <div className="border-t border-gray-100">
                <button
                  onClick={() => setCreatingList(true)}
                  className="w-full flex items-center gap-2.5 px-4 py-3 text-sm text-pink-500 font-medium hover:bg-pink-50 transition-colors"
                >
                  <Plus className="w-4 h-4" />
                  Nova lista
                </button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Main: Products grid ── */}
        <div className="flex-1 min-w-0">
          {activeList && (
            <>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                    <FolderHeart className="w-5 h-5 text-pink-500" />
                    {activeList.name}
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    {activeList.productIds.length} produto{activeList.productIds.length !== 1 ? "s" : ""}
                  </p>
                </div>
                {!activeList.isDefault && (
                  <button
                    onClick={() => setDeletingListId(activeList.id)}
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-red-500 transition-colors px-3 py-1.5 rounded-full hover:bg-red-50"
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Excluir lista
                  </button>
                )}
              </div>

              {activeList.productIds.length === 0 ? (
                <div className="text-center py-16 bg-white rounded-2xl border border-dashed border-pink-200">
                  <div className="w-16 h-16 bg-pink-50 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Heart className="w-8 h-8 text-pink-300" />
                  </div>
                  <p className="text-gray-500 font-medium">Lista vazia</p>
                  <p className="text-sm text-gray-400 mt-1 mb-5">
                    Adicione produtos usando o ícone de coração nos cards.
                  </p>
                  <Link
                    href="/produtos"
                    className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-5 py-2.5 rounded-full text-sm font-semibold hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm"
                  >
                    Explorar Produtos
                  </Link>
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                  {activeList.productIds.map((productId) => (
                    <FavoriteProductCard
                      key={productId}
                      productId={productId}
                      activeListId={activeList.id}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── Delete confirmation modal ── */}
      {deletingListId && (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={() => setDeletingListId(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6 text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Trash2 className="w-6 h-6 text-red-500" />
            </div>
            <h3 className="font-bold text-gray-900 text-lg mb-2">Excluir lista?</h3>
            <p className="text-sm text-gray-500 mb-6">
              A lista &ldquo;{lists.find((l) => l.id === deletingListId)?.name}&rdquo; será excluída permanentemente.
              Os produtos não serão removidos de outras listas.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeletingListId(null)}
                className="flex-1 py-2.5 border border-gray-200 rounded-xl text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDelete(deletingListId)}
                className="flex-1 py-2.5 bg-red-500 text-white rounded-xl text-sm font-medium hover:bg-red-600 transition-colors"
              >
                Excluir
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
