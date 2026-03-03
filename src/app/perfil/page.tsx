"use client";
import Link from "next/link";
import { User, Heart, Star, Calendar, LogIn, MessageCircle } from "lucide-react";
import { useStore } from "@/store/useStore";
import { products } from "@/data/products";
import ReviewCard from "@/components/ReviewCard";

export default function PerfilPage() {
  const { currentUser, openLoginModal, reviews, getAllFavoriteIds, getUserLists } = useStore();
  const allFavoriteIds = getAllFavoriteIds();
  const userLists = getUserLists();

  if (!currentUser) {
    return (
      <div className="max-w-7xl mx-auto px-4 py-16 text-center">
        <div className="max-w-md mx-auto">
          <div className="w-20 h-20 bg-pink-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <User className="w-10 h-10 text-pink-400" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Meu Perfil</h1>
          <p className="text-gray-500 mb-6">
            Faça login para acessar seu perfil e histórico de reviews.
          </p>
          <button
            onClick={() => openLoginModal()}
            className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-3 rounded-full font-semibold hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm"
          >
            <LogIn className="w-4 h-4" />
            Entrar / Criar Conta
          </button>
        </div>
      </div>
    );
  }

  const userReviews = reviews.filter((r) => r.userId === currentUser.id);
  const favoriteProducts = products.filter((p) => allFavoriteIds.includes(p.id));

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Profile header */}
      <div className="bg-gradient-to-r from-pink-500 to-rose-500 rounded-2xl p-6 text-white mb-8">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center text-3xl font-bold">
            {currentUser.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-2xl font-bold">{currentUser.name}</h1>
            <p className="text-pink-100 text-sm">{currentUser.email}</p>
            <p className="text-pink-200 text-xs mt-1 flex items-center gap-1">
              <Calendar className="w-3 h-3" />
              Membro desde {currentUser.joinedAt}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-3 gap-4 mt-5">
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{userReviews.length}</p>
            <p className="text-pink-100 text-xs">Reviews</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">{allFavoriteIds.length}</p>
            <p className="text-pink-100 text-xs">Favoritos</p>
          </div>
          <div className="bg-white/20 rounded-xl p-3 text-center">
            <p className="text-2xl font-bold">
              {userReviews.length > 0
                ? (userReviews.reduce((s, r) => s + r.rating, 0) / userReviews.length).toFixed(1)
                : "—"}
            </p>
            <p className="text-pink-100 text-xs">Média Dada</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* My reviews */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <MessageCircle className="w-5 h-5 text-pink-500" />
            Minhas Reviews
          </h2>
          {userReviews.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
              <p className="text-3xl mb-2">✍️</p>
              <p className="text-gray-500 font-medium">Você ainda não escreveu nenhuma review</p>
              <Link
                href="/produtos"
                className="inline-block mt-3 text-sm text-pink-500 hover:underline"
              >
                Explore produtos e compartilhe sua opinião
              </Link>
            </div>
          ) : (
            <div className="space-y-4">
              {userReviews.map((review) => {
                const product = products.find((p) => p.id === review.productId);
                return (
                  <div key={review.id}>
                    {product && (
                      <Link
                        href={`/produto/${product.id}`}
                        className="text-xs text-pink-600 font-medium mb-1 block hover:underline"
                      >
                        {product.brand} – {product.name}
                      </Link>
                    )}
                    <ReviewCard review={review} />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Sidebar: Favorites preview */}
        <div>
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <Heart className="w-5 h-5 text-pink-500 fill-pink-500" />
            Favoritos
          </h2>
          {favoriteProducts.length === 0 ? (
            <div className="text-center py-10 bg-white rounded-2xl border border-gray-100">
              <p className="text-3xl mb-2">💔</p>
              <p className="text-gray-500 text-sm">Nenhum favorito ainda</p>
              <Link href="/produtos" className="text-xs text-pink-500 hover:underline mt-1 block">
                Explorar produtos
              </Link>
            </div>
          ) : (
            <div className="space-y-3">
              {favoriteProducts.slice(0, 5).map((product) => (
                <Link
                  key={product.id}
                  href={`/produto/${product.id}`}
                  className="flex items-center gap-3 p-3 bg-white rounded-xl border border-gray-100 hover:border-pink-200 transition-colors"
                >
                  <div className="w-12 h-12 bg-gray-100 rounded-lg overflow-hidden shrink-0 relative">
                    <img src={product.image} alt={product.name} className="w-full h-full object-contain p-1 bg-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-pink-500">{product.brand}</p>
                    <p className="text-sm font-medium text-gray-900 truncate">{product.name}</p>
                    <div className="flex items-center gap-1 mt-0.5">
                      <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                      <span className="text-xs text-gray-500">{product.averageRating}</span>
                    </div>
                  </div>
                </Link>
              ))}
              {favoriteProducts.length > 5 && (
                <Link
                  href="/favoritos"
                  className="block text-center text-sm text-pink-600 hover:underline py-2"
                >
                  Ver todos ({favoriteProducts.length})
                </Link>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
