"use client";
import { useState } from "react";
import { ThumbsUp, CheckCircle, XCircle, Package, X, ChevronLeft, ChevronRight, Video } from "lucide-react";
import { Review } from "@/types";
import StarRating from "./StarRating";

interface ReviewCardProps {
  review: Review;
}

export default function ReviewCard({ review }: ReviewCardProps) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  const initials = review.isAnonymous
    ? "A"
    : review.username
        .split(" ")
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();

  const avatarColor = review.isAnonymous
    ? "bg-gray-400"
    : ["bg-pink-500", "bg-purple-500", "bg-rose-500", "bg-indigo-500", "bg-teal-500"][
        review.username.charCodeAt(0) % 5
      ];

  const photos = review.photos ?? [];
  const videos = review.videos ?? [];

  const openLightbox = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const prevPhoto = () =>
    setLightboxIndex((i) => (i !== null ? (i - 1 + photos.length) % photos.length : null));
  const nextPhoto = () =>
    setLightboxIndex((i) => (i !== null ? (i + 1) % photos.length : null));

  const specLabel = review.specification;

  return (
    <>
      <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:border-pink-200 transition-colors">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 ${avatarColor} rounded-full flex items-center justify-center text-white text-sm font-bold shrink-0`}
            >
              {initials}
            </div>
            <div>
              <p className="font-semibold text-gray-900 text-sm">
                {review.isAnonymous ? "Usuária Anônima" : review.username}
              </p>
              <p className="text-xs text-gray-400">{review.createdAt}</p>
            </div>
          </div>
          <div className="text-right">
            <StarRating rating={review.rating} size="sm" />
            <p className="text-xs text-gray-500 mt-0.5 font-bold">{review.rating}/5</p>
          </div>
        </div>

        {/* Specification badge */}
        {specLabel && (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-pink-50 border border-pink-200 text-pink-700 rounded-full text-xs font-medium mb-3">
            <span className="font-bold">Cor:</span> {specLabel}
          </span>
        )}

        {/* Review text */}
        <p className="text-sm text-gray-700 leading-relaxed mb-4">{review.text}</p>

        {/* Photos */}
        {photos.length > 0 && (
          <div className="flex gap-2 flex-wrap mb-3">
            {photos.map((src, idx) => (
              <button
                key={idx}
                onClick={() => openLightbox(idx)}
                className="w-20 h-20 rounded-xl overflow-hidden border border-gray-200 hover:border-pink-300 hover:scale-105 transition-all"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={src} alt={`Foto ${idx + 1}`} className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}

        {/* Video */}
        {videos.length > 0 && (
          <div className="mb-4 space-y-2">
            {videos.map((src, idx) => (
              <div key={idx} className="rounded-xl overflow-hidden border border-violet-200 bg-black">
                <video
                  src={src}
                  controls
                  className="w-full max-h-64 object-contain"
                  preload="metadata"
                />
                <div className="px-3 py-1.5 bg-black/80 flex items-center gap-1.5">
                  <Video className="w-3 h-3 text-violet-400 shrink-0" />
                  <span className="text-xs text-gray-400">Vídeo {idx + 1}</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Metrics */}
        <div className="flex flex-wrap gap-3 pt-3 border-t border-gray-50">
          {review.worthIt !== null && (
            <div className="flex items-center gap-1.5 text-xs">
              {review.worthIt ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className="text-gray-600">
                Valeu a pena:{" "}
                <span className={`font-semibold ${review.worthIt ? "text-emerald-600" : "text-red-500"}`}>
                  {review.worthIt ? "Sim" : "Não"}
                </span>
              </span>
            </div>
          )}
          {review.wouldBuyAgain !== null && (
            <div className="flex items-center gap-1.5 text-xs">
              {review.wouldBuyAgain ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400" />
              )}
              <span className="text-gray-600">
                Recompraria:{" "}
                <span className={`font-semibold ${review.wouldBuyAgain ? "text-emerald-600" : "text-red-500"}`}>
                  {review.wouldBuyAgain ? "Sim" : "Não"}
                </span>
              </span>
            </div>
          )}
          {review.packagingScore > 0 && (
            <div className="flex items-center gap-1.5 text-xs">
              <Package className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-gray-600">
                Embalagem: <span className="font-semibold text-blue-600">{review.packagingScore}/10</span>
              </span>
            </div>
          )}
        </div>

        {/* Helpful */}
        {review.helpful > 0 && (
          <div className="flex items-center gap-1 mt-3 text-xs text-gray-400">
            <ThumbsUp className="w-3 h-3" />
            <span>{review.helpful} pessoas acharam útil</span>
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxIndex !== null && photos.length > 0 && (
        <div
          className="fixed inset-0 z-[200] bg-black/90 flex items-center justify-center p-4"
          onClick={closeLightbox}
        >
          <button
            onClick={closeLightbox}
            className="absolute top-4 right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-5 h-5 text-white" />
          </button>

          {photos.length > 1 && (
            <>
              <button
                onClick={(e) => { e.stopPropagation(); prevPhoto(); }}
                className="absolute left-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <ChevronLeft className="w-6 h-6 text-white" />
              </button>
              <button
                onClick={(e) => { e.stopPropagation(); nextPhoto(); }}
                className="absolute right-4 p-2 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
              >
                <ChevronRight className="w-6 h-6 text-white" />
              </button>
            </>
          )}

          <div onClick={(e) => e.stopPropagation()} className="max-w-2xl max-h-[80vh]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photos[lightboxIndex]}
              alt="Foto da review"
              className="max-w-full max-h-[80vh] object-contain rounded-xl"
            />
            {photos.length > 1 && (
              <p className="text-center text-white/60 text-sm mt-2">
                {lightboxIndex + 1} / {photos.length}
              </p>
            )}
          </div>
        </div>
      )}
    </>
  );
}
