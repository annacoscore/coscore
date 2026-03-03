import Link from "next/link";
import { ArrowRight, Star, TrendingUp } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import AdBanner from "@/components/AdBanner";
import HomeSearchBar from "@/components/HomeSearchBar";
import { products } from "@/data/products";
import { CategoryGroup } from "@/types";

const featuredProducts = products.slice(0, 4);
const newArrivals = [...products].reverse().slice(0, 4);

const categoryGroups: { name: CategoryGroup; color: string; desc: string }[] = [
  { name: "Maquiagem", color: "bg-pink-50  border-pink-200  text-pink-800", desc: "Batom, base, sombra e mais" },
  { name: "Skincare",  color: "bg-rose-50  border-rose-200  text-rose-800", desc: "Sérum, hidratante e protetor" },
  { name: "Cabelo",    color: "bg-pink-100 border-pink-300  text-pink-800", desc: "Shampoo, máscara e finalizador" },
  { name: "Perfumes",  color: "bg-rose-100 border-rose-300  text-rose-800", desc: "Femininos e masculinos" },
];

const topRated = [...products]
  .sort((a, b) => b.averageRating - a.averageRating)
  .slice(0, 4);

export default function HomePage() {
  return (
    <div className="bg-[#fdf8f6]">
      {/* Hero */}
      <section className="relative overflow-hidden" style={{background: "linear-gradient(135deg, #6b3a5c 0%, #a07090 50%, #bc709f 100%)"}}>
        {/* Decorative blobs */}
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-0 left-1/3 w-[500px] h-[500px] bg-white/5 rounded-full blur-3xl" />
          <div className="absolute -bottom-16 -left-16 w-80 h-80 bg-black/10 rounded-full blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 py-16 md:py-24 text-white">
          <div className="flex items-center gap-10 lg:gap-16">

            {/* Texto + ações */}
            <div className="flex-1 min-w-0">
              <h1 className="text-4xl md:text-5xl font-extrabold leading-tight mb-4">
                A sua beleza começa com informação de verdade
              </h1>
              <p className="text-pink-100 text-lg mb-6 leading-relaxed">
                Leia reviews honestas de pessoas reais, compare preços nos principais sites e escolha com mais segurança e economia.
              </p>

              <HomeSearchBar />

              <div className="flex flex-wrap gap-3">
                <Link
                  href="/produtos"
                  className="flex items-center gap-2 bg-white text-pink-600 px-6 py-3 rounded-full font-semibold hover:bg-pink-50 transition-colors shadow-lg"
                >
                  Explorar Produtos
                  <ArrowRight className="w-4 h-4" />
                </Link>
                <Link
                  href="/produtos?q=comparar"
                  className="flex items-center gap-2 bg-white/20 backdrop-blur-sm border border-white/40 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/30 transition-colors"
                >
                  Compare Preços
                  <TrendingUp className="w-4 h-4" />
                </Link>
              </div>
            </div>

            {/* Logo: lua e estrela em branco (fundo preto do PNG some no gradiente) */}
            <div className="hidden lg:flex shrink-0 items-center justify-center w-72 h-72 xl:w-80 xl:h-80">
              <img
                src="/logo-moon.png"
                alt="CoScore"
                className="w-full h-full object-contain"
                style={{ mixBlendMode: "lighten" }}
              />
            </div>

          </div>
        </div>
      </section>

      {/* Ad banner top */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <AdBanner size="leaderboard" />
      </div>

      {/* Categories */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <h2 className="text-xl font-bold text-gray-900 mb-4">Explorar por Categoria</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {categoryGroups.map((group) => (
            <Link
              key={group.name}
              href={`/produtos?grupo=${encodeURIComponent(group.name)}`}
              className={`flex flex-col gap-1 p-5 rounded-2xl border ${group.color} hover:scale-[1.02] transition-transform`}
            >
              <span className="font-semibold text-sm">{group.name}</span>
              <span className="text-xs opacity-70">{group.desc}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* Featured products */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-pink-500" />
            <h2 className="text-xl font-bold text-gray-900">Produtos em Destaque</h2>
          </div>
          <Link href="/produtos" className="text-sm text-pink-600 font-medium hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {featuredProducts.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Features strip */}
      <section className="max-w-7xl mx-auto px-4 py-6">
        <div className="bg-white rounded-2xl border border-pink-100 grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-pink-100">
          {[
            {
              icon: <Star className="w-5 h-5 text-amber-400 fill-amber-400" />,
              title: "Reviews Reais",
              desc: "Avaliações de usuárias que compraram e testaram o produto",
            },
            {
              icon: <TrendingUp className="w-5 h-5 text-pink-500" />,
              title: "Comparação de Preços",
              desc: "Compare preços em lojas confiáveis e economize na compra",
            },
          ].map((item) => (
            <div key={item.title} className="flex items-start gap-3 p-5">
              <div className="p-2 bg-gray-50 rounded-lg shrink-0">{item.icon}</div>
              <div>
                <p className="font-semibold text-gray-900 text-sm">{item.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{item.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Top rated */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400" />
            <h2 className="text-xl font-bold text-gray-900">Mais Bem Avaliados</h2>
          </div>
          <Link href="/produtos?ordem=avaliacao" className="text-sm text-pink-600 font-medium hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {topRated.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>

      {/* Ad banner middle */}
      <div className="max-w-7xl mx-auto px-4 py-4">
        <AdBanner size="wide" />
      </div>

      {/* New arrivals */}
      <section className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-xl font-bold text-gray-900">Novidades</h2>
          <Link href="/produtos" className="text-sm text-pink-600 font-medium hover:underline flex items-center gap-1">
            Ver todos <ArrowRight className="w-3.5 h-3.5" />
          </Link>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {newArrivals.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      </section>
    </div>
  );
}
