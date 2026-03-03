"use client";
import { useState, useRef, useMemo } from "react";
import { Star, Send, UserCircle, Loader2, ImagePlus, X, Video, AlertCircle } from "lucide-react";
import { useStore } from "@/store/useStore";
import { calcReviewCoins } from "@/store/useStore";
import { Product } from "@/types";

interface ReviewFormProps {
  product: Product;
  onSuccess: (coinsEarned?: number) => void;
}

const MAX_PHOTOS = 3;
const MAX_VIDEO_MB = 100;

export default function ReviewForm({ product, onSuccess }: ReviewFormProps) {
  const { currentUser, addReview, openLoginModal } = useStore();

  // Mostra seletor de cor somente se o produto tiver variantes cadastradas
  const colorVariants = product.colors ?? [];
  const hasColors = colorVariants.length > 0;

  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [text, setText] = useState("");
  const [specification, setSpecification] = useState("");
  const [worthIt, setWorthIt] = useState<boolean | null>(null);
  const [wouldBuyAgain, setWouldBuyAgain] = useState<boolean | null>(null);
  const [packagingScore, setPackagingScore] = useState(0);
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);

  // Media state
  const [photos, setPhotos] = useState<string[]>([]);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoName, setVideoName] = useState<string>("");
  const [videoError, setVideoError] = useState<string>("");

  const photoInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);

  const ratingLabels = ["", "Péssimo", "Ruim", "Regular", "Bom", "Ótimo!"];

  // Calcula moedas que serão ganhas em tempo real
  const coinsPreview = useMemo(() => calcReviewCoins({
    rating,
    text,
    specification,
    worthIt,
    wouldBuyAgain,
    photos,
    videos: videoUrl ? [videoUrl] : [],
  }), [rating, text, specification, worthIt, wouldBuyAgain, photos, videoUrl]);

  // Detalhamento de moedas para exibição
  const coinBreakdown = useMemo(() => {
    const items: { label: string; coins: number; earned: boolean }[] = [
      { label: "Avaliação geral", coins: 1, earned: rating > 0 },
      { label: "Texto da review", coins: 1, earned: text.trim().length > 0 },
      ...(hasColors ? [{ label: "Cor selecionada", coins: 1, earned: specification.trim().length > 0 }] : []),
      { label: "Valeu a pena?", coins: 1, earned: worthIt !== null },
      { label: "Recompraria?", coins: 1, earned: wouldBuyAgain !== null },
      ...photos.map((_, i) => ({ label: `Foto ${i + 1}`, coins: 2, earned: true })),
      ...(videoUrl ? [{ label: "Vídeo", coins: 3, earned: true }] : []),
    ];
    return items;
  }, [rating, text, specification, worthIt, wouldBuyAgain, photos, videoUrl, hasColors]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    const remaining = MAX_PHOTOS - photos.length;
    files.slice(0, remaining).forEach((file) => {
      if (!file.type.startsWith("image/")) return;
      const reader = new FileReader();
      reader.onload = (ev) => {
        setPhotos((prev) => [...prev, ev.target?.result as string].slice(0, MAX_PHOTOS));
      };
      reader.readAsDataURL(file);
    });
    if (photoInputRef.current) photoInputRef.current.value = "";
  };

  const handleVideoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    setVideoError("");
    if (!file) return;

    if (!file.type.startsWith("video/")) {
      setVideoError("Formato inválido. Use MP4, MOV ou WEBM.");
      return;
    }

    const sizeMB = file.size / (1024 * 1024);
    if (sizeMB > MAX_VIDEO_MB) {
      setVideoError(`O vídeo deve ter no máximo ${MAX_VIDEO_MB}MB. O seu tem ${sizeMB.toFixed(1)}MB.`);
      return;
    }

    // Revoke old object URL to free memory
    if (videoUrl) URL.revokeObjectURL(videoUrl);

    const url = URL.createObjectURL(file);
    setVideoUrl(url);
    setVideoName(file.name);
    if (videoInputRef.current) videoInputRef.current.value = "";
  };

  const removePhoto = (idx: number) => setPhotos((prev) => prev.filter((_, i) => i !== idx));

  const removeVideo = () => {
    if (videoUrl) URL.revokeObjectURL(videoUrl);
    setVideoUrl(null);
    setVideoName("");
    setVideoError("");
  };

  const validate = () => {
    const errs: string[] = [];
    if (rating === 0) errs.push("Dê uma nota de 1 a 5 estrelas.");
    return errs;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      openLoginModal("Faça login para publicar sua review.");
      return;
    }
    const errs = validate();
    if (errs.length > 0) { setErrors(errs); return; }
    setErrors([]);
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    addReview({
      productId: product.id,
      userId: isAnonymous ? null : currentUser?.id ?? null,
      username: isAnonymous ? "Anônimo" : currentUser?.name ?? "Usuária",
      isAnonymous,
      rating,
      text,
      specification: specification.trim() || undefined,
      photos: photos.length > 0 ? photos : undefined,
      videos: videoUrl ? [videoUrl] : undefined,
      worthIt,
      wouldBuyAgain,
      packagingScore,
    });
    setLoading(false);
    onSuccess(coinsPreview);
  };

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-pink-100 p-6 space-y-6">
      <div className="flex items-center gap-2 mb-2">
        <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
        <h3 className="text-lg font-bold text-gray-900">Escrever Review</h3>
      </div>

      {errors.length > 0 && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl">
          <ul className="text-sm text-red-600 space-y-1 list-disc list-inside">
            {errors.map((e) => <li key={e}>{e}</li>)}
          </ul>
        </div>
      )}

      {/* Star rating */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-3">
          Avaliação Geral <span className="text-red-400">*</span>
        </label>
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setRating(s)}
                onMouseEnter={() => setHoveredRating(s)}
                onMouseLeave={() => setHoveredRating(0)}
                className="hover:scale-110 transition-transform"
              >
                <Star
                  className={`w-8 h-8 transition-colors ${
                    s <= (hoveredRating || rating)
                      ? "fill-amber-400 text-amber-400"
                      : "fill-gray-100 text-gray-200"
                  }`}
                />
              </button>
            ))}
          </div>
          {(hoveredRating || rating) > 0 && (
            <span className="text-sm font-medium text-amber-600 ml-1">
              {ratingLabels[hoveredRating || rating]}
            </span>
          )}
        </div>
      </div>

      {/* Review text */}
      <div>
        <label className="block text-sm font-semibold text-gray-700 mb-1">
          Sua Review <span className="text-xs font-normal text-gray-400">(opcional)</span>
        </label>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          placeholder="Conte sobre sua experiência com o produto. O que você mais gostou? Tem algum ponto negativo?"
          className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm resize-none"
        />
      </div>

      {/* Cor — só aparece quando o produto tem variantes cadastradas */}
      {hasColors && (
        <div>
          <label className="block text-sm font-semibold text-gray-700 mb-2">
            Qual cor/tom você usou?
            <span className="ml-1 text-xs font-normal text-gray-400">(opcional)</span>
          </label>
          <div className="flex flex-wrap gap-1.5">
            {colorVariants.map((variant) => {
              const isSelected = specification === variant.name;
              return (
                <button
                  key={variant.name}
                  type="button"
                  onClick={() => setSpecification(isSelected ? "" : variant.name)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all ${
                    isSelected
                      ? "bg-pink-500 border-pink-500 text-white shadow-sm"
                      : "bg-pink-50 border-pink-200 text-pink-700 hover:bg-pink-100 hover:border-pink-400"
                  }`}
                >
                  {variant.name}
                </button>
              );
            })}
          </div>
          {specification && (
            <p className="text-xs text-pink-500 mt-2">
              Selecionado: <span className="font-semibold">{specification}</span>
              {" · "}
              <button
                type="button"
                onClick={() => setSpecification("")}
                className="underline hover:text-pink-700"
              >
                limpar
              </button>
            </p>
          )}
        </div>
      )}

      {/* ── Fotos + Vídeo ── */}
      <div className="space-y-4">
        <p className="text-sm font-semibold text-gray-700">Fotos e Vídeo <span className="text-xs font-normal text-gray-400">(opcional)</span></p>

        {/* Photos */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <ImagePlus className="w-3.5 h-3.5 text-pink-400" />
              Fotos <span className="text-gray-400">• até {MAX_PHOTOS}</span>
            </label>
            {photos.length < MAX_PHOTOS && (
              <button
                type="button"
                onClick={() => photoInputRef.current?.click()}
                className="text-xs text-pink-600 font-medium hover:underline"
              >
                + Adicionar foto
              </button>
            )}
          </div>

          <input ref={photoInputRef} type="file" accept="image/*" multiple onChange={handlePhotoUpload} className="hidden" />

          {photos.length > 0 ? (
            <div className="flex gap-2.5 flex-wrap">
              {photos.map((src, idx) => (
                <div key={idx} className="relative w-20 h-20 rounded-xl overflow-hidden border border-gray-200 group">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={src} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
                  <button
                    type="button"
                    onClick={() => removePhoto(idx)}
                    className="absolute top-1 right-1 w-5 h-5 bg-black/60 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                  >
                    <X className="w-3 h-3 text-white" />
                  </button>
                </div>
              ))}
              {photos.length < MAX_PHOTOS && (
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  className="w-20 h-20 rounded-xl border-2 border-dashed border-pink-200 hover:border-pink-400 flex flex-col items-center justify-center gap-1 text-pink-300 hover:text-pink-500 transition-colors"
                >
                  <ImagePlus className="w-5 h-5" />
                  <span className="text-[10px]">Adicionar</span>
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={() => photoInputRef.current?.click()}
              className="w-full h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-pink-300 flex items-center justify-center gap-3 text-gray-400 hover:text-pink-400 transition-colors"
            >
              <ImagePlus className="w-5 h-5" />
              <span className="text-sm">Adicionar fotos (JPG, PNG, WEBP)</span>
            </button>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium">ou</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* Video */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-gray-600">
              <Video className="w-3.5 h-3.5 text-violet-400" />
              Vídeo <span className="text-gray-400">• 1 vídeo, máx. {MAX_VIDEO_MB}MB</span>
            </label>
            {videoUrl && (
              <button type="button" onClick={removeVideo} className="text-xs text-red-400 font-medium hover:underline">
                Remover vídeo
              </button>
            )}
          </div>

          <input
            ref={videoInputRef}
            type="file"
            accept="video/mp4,video/mov,video/webm,video/quicktime,video/*"
            onChange={handleVideoUpload}
            className="hidden"
          />

          {videoError && (
            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-xl mb-2 text-sm text-red-600">
              <AlertCircle className="w-4 h-4 shrink-0" />
              {videoError}
            </div>
          )}

          {videoUrl ? (
            <div className="relative rounded-xl overflow-hidden border border-violet-200 bg-black">
              <video
                src={videoUrl}
                controls
                className="w-full max-h-56 object-contain"
                preload="metadata"
              />
              <div className="absolute top-2 right-2">
                <button
                  type="button"
                  onClick={removeVideo}
                  className="w-7 h-7 bg-black/60 rounded-full flex items-center justify-center hover:bg-black/80 transition-colors"
                >
                  <X className="w-3.5 h-3.5 text-white" />
                </button>
              </div>
              <div className="px-3 py-2 bg-black/80 flex items-center gap-2">
                <Video className="w-3.5 h-3.5 text-violet-400 shrink-0" />
                <span className="text-xs text-gray-300 truncate">{videoName}</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => videoInputRef.current?.click()}
              className="w-full h-20 rounded-xl border-2 border-dashed border-gray-200 hover:border-violet-300 flex items-center justify-center gap-3 text-gray-400 hover:text-violet-500 transition-colors"
            >
              <Video className="w-5 h-5" />
              <span className="text-sm">Adicionar vídeo (MP4, MOV, WEBM)</span>
            </button>
          )}
        </div>
      </div>

      {/* Questions */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Valeu a pena? <span className="text-xs font-normal text-gray-400">(opcional)</span>
          </p>
          <div className="flex gap-2">
            {[true, false].map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setWorthIt(val)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                  worthIt === val
                    ? val ? "bg-emerald-500 border-emerald-500 text-white" : "bg-red-400 border-red-400 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-pink-300"
                }`}
              >
                {val ? "✅ Sim" : "❌ Não"}
              </button>
            ))}
          </div>
        </div>

        <div className="bg-gray-50 rounded-xl p-4">
          <p className="text-sm font-semibold text-gray-700 mb-3">
            Recompraria? <span className="text-xs font-normal text-gray-400">(opcional)</span>
          </p>
          <div className="flex gap-2">
            {[true, false].map((val) => (
              <button
                key={String(val)}
                type="button"
                onClick={() => setWouldBuyAgain(val)}
                className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-all ${
                  wouldBuyAgain === val
                    ? val ? "bg-emerald-500 border-emerald-500 text-white" : "bg-red-400 border-red-400 text-white"
                    : "bg-white border-gray-200 text-gray-600 hover:border-pink-300"
                }`}
              >
                {val ? "✅ Sim" : "❌ Não"}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Packaging score */}
      <div>
        <p className="text-sm font-semibold text-gray-700 mb-2">
          Nota para a Embalagem (1-10) <span className="text-xs font-normal text-gray-400">(opcional)</span>
        </p>
        <div className="flex gap-1.5 flex-wrap">
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setPackagingScore(n)}
              className={`w-9 h-9 rounded-lg text-sm font-bold border transition-all ${
                packagingScore === n
                  ? "bg-pink-500 border-pink-500 text-white"
                  : "bg-white border-gray-200 text-gray-600 hover:border-pink-300"
              }`}
            >
              {n}
            </button>
          ))}
        </div>
        {packagingScore > 0 && (
          <p className="text-xs text-gray-500 mt-1">
            {packagingScore <= 3 ? "Embalagem ruim" : packagingScore <= 6 ? "Embalagem ok" : packagingScore <= 8 ? "Boa embalagem" : "Embalagem incrível!"}
          </p>
        )}
      </div>

      {/* ── Preview de moedas ── */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">🪙</span>
            <p className="text-sm font-bold text-amber-800">Moedas que você vai ganhar</p>
          </div>
          <div className="flex items-center gap-1.5 bg-amber-400 text-white px-3 py-1 rounded-full font-bold text-sm shadow-sm">
            <span className="text-base">🪙</span>
            <span>{coinsPreview}</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {coinBreakdown.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border transition-all ${
                item.earned
                  ? "bg-amber-100 border-amber-300 text-amber-800"
                  : "bg-white border-gray-200 text-gray-400 line-through"
              }`}
            >
              <span>{item.earned ? "🪙" : "○"}</span>
              <span>+{item.coins} {item.label}</span>
            </div>
          ))}
        </div>
        {coinsPreview === 0 && (
          <p className="text-xs text-amber-600 mt-2">Dê pelo menos uma nota para ganhar moedas!</p>
        )}
      </div>

      {/* Login obrigatório / opção de anonimato */}
      {!currentUser ? (
        <div className="bg-pink-50 border border-pink-200 rounded-xl p-4">
          <div className="flex items-start gap-3">
            <UserCircle className="w-5 h-5 text-pink-500 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-pink-800">Login necessário</p>
              <p className="text-xs text-pink-600 mt-0.5">
                Você precisa estar logada para publicar uma review.
              </p>
              <button
                type="button"
                onClick={() => openLoginModal("Faça login para publicar sua review.")}
                className="mt-2 text-xs font-semibold text-white bg-pink-500 hover:bg-pink-600 px-3 py-1.5 rounded-full transition-colors"
              >
                Fazer login
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {/* Prévia de quem vai aparecer na review */}
          <div className="flex items-center gap-2.5 bg-gray-50 border border-gray-200 rounded-xl px-4 py-2.5">
            <div className="w-8 h-8 bg-pink-500 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0">
              {isAnonymous ? "A" : currentUser.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-gray-400">Publicando como</p>
              <p className="text-sm font-semibold text-gray-800 truncate">
                {isAnonymous ? "Usuária Anônima" : currentUser.name}
              </p>
            </div>
          </div>

          {/* Opção de anonimato */}
          <div className="flex items-center gap-2">
            <input
              type="checkbox"
              id="anon"
              checked={isAnonymous}
              onChange={(e) => setIsAnonymous(e.target.checked)}
              className="w-4 h-4 accent-pink-500"
            />
            <label htmlFor="anon" className="text-sm text-gray-600 cursor-pointer">
              Postar como anônimo
              <span className="ml-1 text-xs text-gray-400">(seu nome não aparecerá no site)</span>
            </label>
          </div>
        </div>
      )}

      <button
        type="submit"
        disabled={loading}
        className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-3 rounded-xl font-semibold hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-70 flex items-center justify-center gap-2 shadow-sm"
      >
        {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        {loading ? "Enviando..." : "Publicar Review"}
      </button>
    </form>
  );
}
