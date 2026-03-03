"use client";

interface AdBannerProps {
  size?: "leaderboard" | "rectangle" | "skyscraper" | "wide";
  className?: string;
}

const adSizes = {
  leaderboard: { width: "100%", height: "90px", label: "728×90" },
  rectangle: { width: "300px", height: "250px", label: "300×250" },
  skyscraper: { width: "160px", height: "600px", label: "160×600" },
  wide: { width: "100%", height: "120px", label: "970×120" },
};

export default function AdBanner({ size = "leaderboard", className = "" }: AdBannerProps) {
  const ad = adSizes[size];

  return (
    <div
      className={`flex items-center justify-center bg-gradient-to-r from-gray-100 to-gray-50 border border-dashed border-gray-300 rounded-xl overflow-hidden ${className}`}
      style={{ width: ad.width, height: ad.height, minWidth: size === "rectangle" ? "300px" : undefined }}
    >
      <div className="text-center">
        <p className="text-xs text-gray-400 font-medium uppercase tracking-wider">Publicidade</p>
        <p className="text-xs text-gray-300">{ad.label}</p>
      </div>
    </div>
  );
}
