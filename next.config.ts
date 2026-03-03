import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "picsum.photos" },
      // Mercado Livre CDN — cobre http2.mlstatic.com, mlb-s1-p.mlstatic.com, etc.
      { protocol: "https", hostname: "**.mlstatic.com" },
      { protocol: "http",  hostname: "**.mlstatic.com" },
      // Open Beauty Facts
      { protocol: "https", hostname: "images.openbeautyfacts.org" },
      { protocol: "https", hostname: "static.openfoodfacts.org" },
      // Lojas brasileiras (para logos e imagens de produto)
      { protocol: "https", hostname: "logodownload.org" },
      // Amazon CDN — imagens reais de produtos
      { protocol: "https", hostname: "m.media-amazon.com" },
    ],
  },
};

export default nextConfig;
