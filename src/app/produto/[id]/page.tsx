"use client";
import { useState, use } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Heart,
  ShoppingCart,
  ChevronLeft,
  Tag,
  Star,
  MessageCircle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  X,
} from "lucide-react";
import { products } from "@/data/products";
import { getCategoryDisplayName } from "@/types";
import { useStore } from "@/store/useStore";
import StarRating from "@/components/StarRating";
import ReviewCard from "@/components/ReviewCard";
import ReviewForm from "@/components/ReviewForm";
import PriceComparisonModal from "@/components/PriceComparisonModal";
import AdBanner from "@/components/AdBanner";
import ProductCard from "@/components/ProductCard";
import { notFound } from "next/navigation";
import { cleanDisplayName } from "@/lib/displayName";

export default function ProductPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const product = products.find((p) => p.id === id);

  const { currentUser, isFavorite, toggleFavorite, openLoginModal, getProductReviews } = useStore();
  const [showPriceModal, setShowPriceModal] = useState(false);
  const [showReviewForm, setShowReviewForm] = useState(false);
  const [reviewSuccess, setReviewSuccess] = useState(false);
  const [reviewCoins, setReviewCoins] = useState(0);
  const [showAllReviews, setShowAllReviews] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string | null>(null);
  const [colorImage, setColorImage] = useState<string | null>(null);

  if (!product) return notFound();

  // Variantes de cor que possuem imagem própria
  const colorsWithImage = (product.colors ?? []).filter(c => !!c.image);

  // Se o produto tem variantes de cor com imagem → galeria mostra uma imagem por cor
  // Caso contrário → galeria mostra as fotos normais do produto
  type GalleryItem = { src: string; colorName?: string };
  const galleryItems: GalleryItem[] = colorsWithImage.length > 1
    ? colorsWithImage.map(c => ({ src: c.image!, colorName: c.name }))
    : (() => {
        const rawImgs = [...(product.images ?? []), product.image].filter(Boolean) as string[];
        const base = rawImgs.length > 0 ? [...new Set(rawImgs)] : [`https://picsum.photos/seed/${product.id}/600/600`];
        // Se um tom foi selecionado e tem imagem própria, coloca na frente
        if (colorImage) {
          return [{ src: colorImage }, ...base.filter(s => s !== colorImage).map(s => ({ src: s }))];
        }
        return base.map(s => ({ src: s }));
      })();

  const images = galleryItems.map(g => g.src);
  const reviews = getProductReviews(product.id);
  const favorite = isFavorite(product.id);
  const inStockPrices = product.prices.filter((p) => p.inStock);
  const lowestPrice = inStockPrices.length > 0 ? Math.min(...inStockPrices.map((p) => p.price)) : null;
  const displayedReviews = showAllReviews ? reviews : reviews.slice(0, 4);

  const worthItCount = reviews.filter((r) => r.worthIt === true).length;
  const wouldBuyAgainCount = reviews.filter((r) => r.wouldBuyAgain === true).length;
  const avgPackaging =
    reviews.length > 0
      ? reviews.reduce((sum, r) => sum + r.packagingScore, 0) / reviews.length
      : 0;

  const ratingCounts = [5, 4, 3, 2, 1].map((star) => ({
    star,
    count: reviews.filter((r) => r.rating === star).length,
    pct:
      reviews.length > 0
        ? (reviews.filter((r) => r.rating === star).length / reviews.length) * 100
        : 0,
  }));

  const handleFavorite = () => {
    if (!currentUser) {
      openLoginModal("Faça login para salvar este produto nos seus favoritos.");
      return;
    }
    toggleFavorite(product.id);
  };

  const handleReviewSuccess = (coinsEarned = 0) => {
    setShowReviewForm(false);
    setReviewCoins(coinsEarned);
    setReviewSuccess(true);
    setTimeout(() => setReviewSuccess(false), 6000);
  };

  const prevImage = () => setActiveImageIndex((i) => (i - 1 + images.length) % images.length);
  const nextImage = () => setActiveImageIndex((i) => (i + 1) % images.length);

  const relatedProducts = products
    .filter((p) => p.id !== product.id && (p.category === product.category || p.brand === product.brand))
    .slice(0, 4);

  return (
    <div className="bg-[#fdf8f6]">
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-sm text-gray-500 mb-4">
          <Link href="/" className="hover:text-pink-600">Início</Link>
          <span>/</span>
          <Link href="/produtos" className="hover:text-pink-600">Produtos</Link>
          <span>/</span>
          <Link href={`/produtos?categoria=${product.category}`} className="hover:text-pink-600">{getCategoryDisplayName(product.category)}</Link>
          <span>/</span>
          <span className="text-gray-700 font-medium truncate max-w-[200px]">{cleanDisplayName(product.name)}</span>
        </nav>

        <Link href="/produtos" className="inline-flex items-center gap-1 text-sm text-pink-600 hover:underline mb-5">
          <ChevronLeft className="w-4 h-4" /> Voltar para Produtos
        </Link>

        {/* Main content */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">

          {/* ── Image Gallery ── */}
          <div className="flex flex-col gap-3">
            {/* Main image */}
            <div className="relative aspect-square bg-white rounded-2xl overflow-hidden shadow-sm border border-pink-50 group">
              <Image
                src={images[activeImageIndex]}
                alt={`${product.name} – foto ${activeImageIndex + 1}`}
                fill
                className="object-contain p-3 cursor-zoom-in"
                sizes="(max-width: 1024px) 100vw, 50vw"
                priority
                onClick={() => setLightboxOpen(true)}
              />

              {/* Heart button – floating on image */}
              <button
                onClick={handleFavorite}
                className={`absolute top-3 right-3 z-10 p-2.5 rounded-full shadow-md backdrop-blur-sm transition-all duration-200 hover:scale-110 active:scale-95 ${
                  favorite
                    ? "bg-pink-500 shadow-pink-200"
                    : "bg-white/90 hover:bg-pink-50"
                }`}
                title={favorite ? "Remover dos favoritos" : "Adicionar aos favoritos"}
              >
                <Heart
                  className={`w-5 h-5 transition-colors ${
                    favorite ? "fill-white text-white" : "text-pink-400"
                  }`}
                />
              </button>

              {/* Image counter / color badge */}
              {images.length > 1 && (
                <span className="absolute bottom-3 left-3 px-2 py-1 bg-black/40 backdrop-blur-sm text-white text-xs font-medium rounded-full max-w-[60%] truncate">
                  {galleryItems[activeImageIndex]?.colorName
                    ? galleryItems[activeImageIndex].colorName
                    : `${activeImageIndex + 1} / ${images.length}`}
                </span>
              )}

              {/* Arrows */}
              {images.length > 1 && (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); prevImage(); }}
                    className="absolute left-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 shadow hover:bg-white transition-all opacity-0 group-hover:opacity-100"
                  >
                    <ChevronLeft className="w-4 h-4 text-gray-700" />
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); nextImage(); }}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-2 rounded-full bg-white/80 shadow hover:bg-white transition-all opacity-0 group-hover:opacity-100 mr-12"
                  >
                    <ChevronRight className="w-4 h-4 text-gray-700" />
                  </button>
                </>
              )}
            </div>

            {/* Thumbnails */}
            {images.length > 1 && (
              <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
                {galleryItems.map((item, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setActiveImageIndex(idx);
                      // Se este thumbnail representa uma cor, seleciona ela também
                      if (item.colorName) {
                        setSelectedColor(item.colorName);
                        setColorImage(item.src);
                      }
                    }}
                    title={item.colorName ?? `Foto ${idx + 1}`}
                    className={`relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                      idx === activeImageIndex
                        ? "border-pink-500 scale-105 shadow-md"
                        : "border-gray-200 hover:border-pink-300 opacity-70 hover:opacity-100"
                    }`}
                  >
                    <Image
                      src={item.src}
                      alt={item.colorName ?? `Foto ${idx + 1}`}
                      fill
                      className="object-contain p-1"
                      sizes="64px"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* ── Product Info ── */}
          <div className="flex flex-col gap-4">
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="px-2.5 py-0.5 bg-pink-100 text-pink-700 rounded-full text-xs font-semibold">
                  {getCategoryDisplayName(product.category)}
                </span>
                <span className="text-sm text-pink-500 font-semibold">{product.brand}</span>
              </div>
              <h1 className="text-2xl md:text-3xl font-extrabold text-gray-900 leading-tight">
                {cleanDisplayName(product.name)}
              </h1>
            </div>

            {/* Cores / tons disponíveis — só aparece quando o produto tem variação de cor */}
            {product.colors && product.colors.length > 0 && (
              <div className="bg-white rounded-xl border border-pink-100 p-4">
                <p className="text-sm font-semibold text-gray-800 mb-3">
                  Cor / tom
                  <span className="ml-1.5 font-normal text-gray-400">({product.colors.length} opções)</span>
                </p>
                <div className="flex flex-wrap gap-2">
                  {product.colors.map((variant) => {
                    const isSelected = selectedColor === variant.name;
                    const hasImage = !!variant.image;
                    const galleryIdx = galleryItems.findIndex(g => g.colorName === variant.name);
                    return (
                      <button
                        key={variant.name}
                        type="button"
                        onClick={() => {
                          if (isSelected) {
                            setSelectedColor(null);
                            setColorImage(null);
                            setActiveImageIndex(0);
                          } else {
                            setSelectedColor(variant.name);
                            setColorImage(variant.image ?? null);
                            setActiveImageIndex(galleryIdx >= 0 ? galleryIdx : 0);
                          }
                        }}
                        title={hasImage ? `Ver imagem: ${variant.name}` : variant.name}
                        className={`flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-left transition-all ${
                          isSelected
                            ? "border-pink-500 bg-pink-50 text-pink-800 shadow-sm"
                            : "border-gray-200 bg-gray-50/50 text-gray-700 hover:border-pink-300 hover:bg-pink-50/50"
                        }`}
                      >
                        {hasImage && (
                          <span className="relative w-8 h-8 shrink-0 rounded-lg overflow-hidden border border-gray-200 bg-white">
                            <Image
                              src={variant.image!}
                              alt={variant.name}
                              fill
                              className="object-contain p-0.5"
                              sizes="32px"
                            />
                          </span>
                        )}
                        <span className="text-xs font-medium">{variant.name}</span>
                      </button>
                    );
                  })}
                </div>
                {selectedColor && colorsWithImage.length <= 1 && (
                  <p className="text-xs text-pink-600 mt-2">
                    Tom selecionado: <span className="font-semibold">{selectedColor}</span>
                    {" · "}
                    <button
                      type="button"
                      onClick={() => { setSelectedColor(null); setColorImage(null); setActiveImageIndex(0); }}
                      className="underline hover:text-pink-700"
                    >
                      limpar
                    </button>
                  </p>
                )}
              </div>
            )}

            {/* Rating summary */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5">
                <StarRating rating={product.averageRating} size="md" />
                <span className="font-bold text-gray-900 text-lg">{product.averageRating.toFixed(1)}</span>
              </div>
              <span className="text-sm text-gray-500 flex items-center gap-1">
                <MessageCircle className="w-4 h-4" />
                {reviews.length} review{reviews.length !== 1 ? "s" : ""}
              </span>
            </div>

            {/* Rating bar breakdown */}
            <div className="bg-white rounded-xl border border-gray-100 p-4 space-y-1.5">
              {ratingCounts.map(({ star, count, pct }) => (
                <div key={star} className="flex items-center gap-2 text-xs">
                  <span className="text-gray-500 w-10 shrink-0">{star} ★</span>
                  <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-amber-400 rounded-full transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-gray-400 w-5 shrink-0">{count}</span>
                </div>
              ))}
            </div>

            {/* Quick stats */}
            {reviews.length > 0 && (
              <div className="grid grid-cols-3 gap-3">
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xl font-bold text-emerald-600">
                    {Math.round((worthItCount / reviews.length) * 100)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Valeu a pena</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xl font-bold text-pink-600">
                    {Math.round((wouldBuyAgainCount / reviews.length) * 100)}%
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">Recompraria</p>
                </div>
                <div className="bg-white rounded-xl border border-gray-100 p-3 text-center">
                  <p className="text-xl font-bold text-blue-600">{avgPackaging.toFixed(1)}</p>
                  <p className="text-xs text-gray-500 mt-0.5">Embalagem /10</p>
                </div>
              </div>
            )}

            {/* Tags */}
            <div className="flex flex-wrap gap-2">
              {product.tags.map((tag) => (
                <span
                  key={tag}
                  className="flex items-center gap-1 px-3 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-medium"
                >
                  <Tag className="w-3 h-3" /> {tag}
                </span>
              ))}
            </div>

            {/* Description */}
            <p className="text-gray-600 text-sm leading-relaxed">{product.description}</p>

            {/* Price & CTA */}
            <div className="bg-white rounded-2xl border border-pink-100 p-4 mt-auto">
              <div className="flex items-center justify-between mb-3">
                <div>
                  {lowestPrice !== null ? (
                    <>
                      <p className="text-xs text-gray-400">A partir de</p>
                      <p className="text-3xl font-extrabold text-gray-900">
                        R$ {lowestPrice.toFixed(2).replace(".", ",")}
                      </p>
                      <p className="text-xs text-gray-400">{product.prices.length} lojas disponíveis</p>
                    </>
                  ) : (
                    <p className="text-sm text-gray-400 font-medium">Preços em breve</p>
                  )}
                  {selectedColor && (
                    <p className="text-xs text-pink-500 font-medium mt-1 flex items-center gap-1">
                      <span className="inline-block w-2 h-2 rounded-full bg-pink-400" />
                      Tom: {selectedColor}
                    </p>
                  )}
                </div>

                {/* Heart button also here, in the price card */}
                <button
                  onClick={handleFavorite}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 font-medium text-sm transition-all duration-200 hover:scale-105 active:scale-95 ${
                    favorite
                      ? "border-pink-400 bg-pink-500 text-white shadow-md shadow-pink-200"
                      : "border-pink-200 text-pink-500 hover:border-pink-400 hover:bg-pink-50"
                  }`}
                >
                  <Heart className={`w-4 h-4 ${favorite ? "fill-white text-white" : ""}`} />
                  {favorite ? "Favoritado" : "Favoritar"}
                </button>
              </div>
              <button
                onClick={() => setShowPriceModal(true)}
                className="w-full bg-gradient-to-r from-emerald-500 to-teal-500 text-white py-3 rounded-xl font-semibold hover:from-emerald-600 hover:to-teal-600 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <ShoppingCart className="w-4 h-4" />
                Onde Comprar
              </button>
            </div>
          </div>
        </div>

        {/* Ad banner */}
        <div className="mb-8">
          <AdBanner size="leaderboard" />
        </div>

        {/* Reviews section */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
          {/* Reviews list */}
          <div className="lg:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                <Star className="w-5 h-5 fill-amber-400 text-amber-400" />
                Reviews ({reviews.length})
              </h2>
              <button
                onClick={() => setShowReviewForm(!showReviewForm)}
                className="text-sm bg-pink-500 text-white px-4 py-2 rounded-full hover:bg-pink-600 transition-colors font-medium"
              >
                {showReviewForm ? "Cancelar" : "Escrever Review"}
              </button>
            </div>

            {reviewSuccess && (
              <div className="flex items-start gap-3 p-4 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-700 text-sm">
                <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold">Review publicada com sucesso! Obrigada pela avaliação.</p>
                  {reviewCoins > 0 && (
                    <p className="mt-1 flex items-center gap-1.5 text-amber-600 font-medium">
                      <span className="text-base">🪙</span>
                      Você ganhou <span className="font-bold">{reviewCoins} moeda{reviewCoins !== 1 ? "s" : ""}</span>! Veja seu cofrinho no perfil.
                    </p>
                  )}
                </div>
              </div>
            )}

            {showReviewForm && (
              <ReviewForm product={product} onSuccess={handleReviewSuccess} />
            )}

            {reviews.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-2xl border border-gray-100">
                <p className="text-3xl mb-2">✍️</p>
                <p className="text-gray-500 font-medium">Seja a primeira a avaliar!</p>
                <p className="text-sm text-gray-400 mt-1">Compartilhe sua experiência com este produto.</p>
              </div>
            ) : (
              <>
                <div className="space-y-4">
                  {displayedReviews.map((review) => (
                    <ReviewCard key={review.id} review={review} />
                  ))}
                </div>
                {reviews.length > 4 && (
                  <button
                    onClick={() => setShowAllReviews(!showAllReviews)}
                    className="w-full py-3 border border-pink-200 rounded-xl text-sm font-medium text-pink-600 hover:bg-pink-50 transition-colors flex items-center justify-center gap-2"
                  >
                    {showAllReviews ? (
                      <><ChevronUp className="w-4 h-4" /> Mostrar menos</>
                    ) : (
                      <><ChevronDown className="w-4 h-4" /> Ver todas as {reviews.length} reviews</>
                    )}
                  </button>
                )}
              </>
            )}
          </div>

          {/* Sidebar */}
          <div className="space-y-4">
            {reviews.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-100 p-5">
                <h3 className="font-bold text-gray-900 mb-4">Resumo das Reviews</h3>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Valeu a pena</span>
                      <span className="font-semibold text-emerald-600">{worthItCount}/{reviews.length}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${(worthItCount / reviews.length) * 100}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="text-gray-600">Recompraria</span>
                      <span className="font-semibold text-pink-600">{wouldBuyAgainCount}/{reviews.length}</span>
                    </div>
                    <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-pink-400 rounded-full" style={{ width: `${(wouldBuyAgainCount / reviews.length) * 100}%` }} />
                    </div>
                  </div>
                  <div className="pt-2 border-t border-gray-50">
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Nota da Embalagem</span>
                      <span className="font-bold text-blue-600 text-lg">{avgPackaging.toFixed(1)}/10</span>
                    </div>
                  </div>
                </div>
              </div>
            )}
            <AdBanner size="rectangle" />
          </div>
        </div>

        {/* Related products */}
        {relatedProducts.length > 0 && (
          <section className="mb-8">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Produtos Relacionados</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {relatedProducts.map((p) => (
                <ProductCard key={p.id} product={p} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Price comparison modal */}
      {showPriceModal && (
        <PriceComparisonModal
          product={product}
          onClose={() => setShowPriceModal(false)}
          selectedColor={selectedColor}
        />
      )}

      {/* Image lightbox */}
      {lightboxOpen && (
        <div
          className="fixed inset-0 z-[150] bg-black/95 flex items-center justify-center p-4"
          onClick={() => setLightboxOpen(false)}
        >
          <button
            onClick={() => setLightboxOpen(false)}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {images.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevImage(); }}
                className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextImage(); }}
                className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}

          <div onClick={(e) => e.stopPropagation()} className="relative max-w-3xl max-h-[85vh] w-full">
            <Image
              src={images[activeImageIndex]}
              alt={product.name}
              width={800}
              height={800}
              className="object-contain rounded-xl max-h-[85vh] w-full"
            />
          </div>

          {/* Thumbnail strip in lightbox */}
          {images.length > 1 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex gap-2">
              {images.map((src, idx) => (
                <button
                  key={idx}
                  onClick={(e) => { e.stopPropagation(); setActiveImageIndex(idx); }}
                  className={`w-12 h-12 rounded-lg overflow-hidden border-2 transition-all ${
                    idx === activeImageIndex ? "border-white scale-110" : "border-white/30 opacity-60 hover:opacity-100"
                  }`}
                >
                  <Image src={src} alt="" width={48} height={48} className="object-contain w-full h-full p-1" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
