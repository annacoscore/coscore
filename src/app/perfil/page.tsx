"use client";
import Link from "next/link";
import { User, Heart, Star, Calendar, LogIn, MessageCircle } from "lucide-react";
import { useStore } from "@/store/useStore";
import { products } from "@/data/products";
import ReviewCard from "@/components/ReviewCard";

// Calcula a "raridade" do cofrinho com base nas moedas
function coinTier(coins: number): { label: string; emoji: string; color: string; next: number | null; progress: number } {
  if (coins < 10)  return { label: "Iniciante",   emoji: "🪙", color: "from-gray-400 to-gray-500",          next: 10,  progress: coins / 10 };
  if (coins < 30)  return { label: "Bronze",       emoji: "🥉", color: "from-amber-600 to-amber-700",        next: 30,  progress: (coins - 10)  / 20 };
  if (coins < 60)  return { label: "Prata",        emoji: "🥈", color: "from-slate-400 to-slate-500",        next: 60,  progress: (coins - 30)  / 30 };
  if (coins < 100) return { label: "Ouro",         emoji: "🥇", color: "from-yellow-400 to-amber-500",       next: 100, progress: (coins - 60)  / 40 };
  if (coins < 200) return { label: "Diamante",     emoji: "💎", color: "from-sky-400 to-violet-500",         next: 200, progress: (coins - 100) / 100 };
  return              { label: "Lendária",     emoji: "👑", color: "from-pink-500 to-rose-600",          next: null, progress: 1 };
}

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
            <p className="text-2xl font-bold flex items-center justify-center gap-1">
              <span>🪙</span>
              {currentUser.coins ?? 0}
            </p>
            <p className="text-pink-100 text-xs">Moedas</p>
          </div>
        </div>
      </div>

      {/* ── Cofrinho ── */}
      {(() => {
        const totalCoins = currentUser.coins ?? 0;
        const tier = coinTier(totalCoins);
        return (
          <div className="mb-8 rounded-2xl overflow-hidden border border-amber-200 shadow-sm">
            <div className={`bg-gradient-to-r ${tier.color} p-5 text-white`}>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-14 h-14 bg-white/20 rounded-full flex items-center justify-center text-3xl shadow-inner">
                    {tier.emoji}
                  </div>
                  <div>
                    <p className="text-xs font-medium text-white/70 uppercase tracking-wider">Meu Cofrinho</p>
                    <p className="text-2xl font-bold">{totalCoins} moeda{totalCoins !== 1 ? "s" : ""}</p>
                    <p className="text-sm text-white/80 mt-0.5">Nível: <span className="font-semibold">{tier.label}</span></p>
                  </div>
                </div>
                <div className="text-right hidden sm:block">
                  <p className="text-xs text-white/60">Como ganhar moedas?</p>
                  <div className="mt-1 space-y-0.5 text-xs text-white/80">
                    <p>⭐ Avaliação geral → 1 moeda</p>
                    <p>📝 Texto da review → 1 moeda</p>
                    <p>🎨 Cor selecionada → 1 moeda</p>
                    <p>✅ Valeu a pena / Recompraria → 1 cada</p>
                    <p>📸 Foto → 2 moedas &nbsp;|&nbsp; 🎥 Vídeo → 3 moedas</p>
                  </div>
                </div>
              </div>

              {/* Barra de progresso */}
              {tier.next !== null && (
                <div className="mt-4">
                  <div className="flex justify-between text-xs text-white/70 mb-1">
                    <span>{tier.label}</span>
                    <span>{tier.next} moedas para o próximo nível</span>
                  </div>
                  <div className="w-full bg-white/20 rounded-full h-2.5 overflow-hidden">
                    <div
                      className="h-full bg-white/90 rounded-full transition-all duration-700"
                      style={{ width: `${Math.min(tier.progress * 100, 100)}%` }}
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Histórico de moedas por review */}
            {userReviews.some((r) => r.coinsEarned) && (
              <div className="bg-amber-50 px-5 py-3 border-t border-amber-200">
                <p className="text-xs font-semibold text-amber-700 mb-2">Histórico de ganhos</p>
                <div className="flex flex-wrap gap-2">
                  {userReviews.filter((r) => r.coinsEarned).map((r) => {
                    const prod = products.find((p) => p.id === r.productId);
                    return (
                      <div key={r.id} className="flex items-center gap-1.5 bg-white border border-amber-200 rounded-full px-3 py-1 text-xs text-amber-800">
                        <span>🪙</span>
                        <span className="font-bold">+{r.coinsEarned}</span>
                        {prod && <span className="text-amber-600 truncate max-w-[120px]">{prod.name}</span>}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        );
      })()}

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
