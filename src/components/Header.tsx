"use client";
import Link from "next/link";
import Image from "next/image";
import { useRouter, usePathname } from "next/navigation";
import { useState, useRef, useEffect } from "react";
import { Search, Heart, User, LogOut, Menu, X, ChevronDown } from "lucide-react";
import { useStore } from "@/store/useStore";
import { CategoryGroup, GROUP_CATEGORIES, getCategoryDisplayName } from "@/types";
import { products } from "@/data/products";

const productCountByCategory = products.reduce<Record<string, number>>((acc, p) => {
  acc[p.category] = (acc[p.category] ?? 0) + 1;
  return acc;
}, {});

const GROUP_ICONS: Record<CategoryGroup, string> = {
  Maquiagem: "",
  Skincare: "",
  Perfumes: "",
  Cabelo: "",
};

function GroupDropdown({ group }: { group: CategoryGroup }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Apenas subcategorias com pelo menos 1 produto
  const categories = GROUP_CATEGORIES[group].filter(
    c => (productCountByCategory[c] ?? 0) > 0
  );

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-1.5 rounded-full text-sm font-medium text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
      >
        {group}
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          onMouseLeave={() => setOpen(false)}
          className="absolute top-full left-0 mt-1 bg-white rounded-2xl shadow-lg border border-pink-100 py-2 min-w-[180px] z-50"
        >
          {/* Ver todos do grupo */}
          <Link
            href={`/produtos?grupo=${group}`}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-4 py-2 text-sm font-semibold text-pink-600 hover:bg-pink-50 transition-colors"
          >
            Ver tudo em {group}
          </Link>
          <div className="border-t border-pink-50 my-1" />

          {/* Subcategorias com produtos */}
          {categories.map((cat) => (
            <Link
              key={cat}
              href={`/produtos?categoria=${encodeURIComponent(cat)}`}
              onClick={() => setOpen(false)}
              className="block px-4 py-2 text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600 transition-colors"
            >
              {getCategoryDisplayName(cat)}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, logout, openLoginModal, getAllFavoriteIds } = useStore();
  const totalFavorites = getAllFavoriteIds().length;
  const [searchQuery, setSearchQuery] = useState("");
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileGroupOpen, setMobileGroupOpen] = useState<CategoryGroup | null>(null);

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/produtos?q=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setMobileMenuOpen(false);
    }
  };

  const groups: CategoryGroup[] = ["Maquiagem", "Skincare", "Cabelo", "Perfumes"];

  return (
    <header className="bg-white shadow-sm sticky top-0 z-50 border-b border-pink-100">
      <div className="max-w-7xl mx-auto px-4">
        {/* Top bar */}
        <div className="flex items-center justify-between h-16 gap-4">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 shrink-0">
            <Image
              src="/logo.png"
              alt="CoScore"
              width={38}
              height={38}
              className="rounded-xl"
              priority
            />
            <span className="logo-wordmark text-[1.25rem]">
              <span className="logo-wordmark-co">Co</span><span className="logo-wordmark-score">Score</span>
            </span>
          </Link>

          {/* Search */}
          <form onSubmit={handleSearch} className="flex-1 max-w-xl hidden md:flex">
            <div className="relative w-full">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar produtos, marcas..."
                className="w-full pl-10 pr-4 py-2 rounded-full border border-pink-200 bg-pink-50/50 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent text-sm"
              />
            </div>
          </form>

          {/* Actions */}
          <div className="flex items-center gap-2">
            {currentUser ? (
              <>
                <Link
                  href="/favoritos"
                  className="p-2 rounded-full hover:bg-pink-50 transition-colors relative"
                  title="Favoritos"
                >
                  <Heart className="w-5 h-5 text-pink-500" />
                  {totalFavorites > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-pink-500 text-white text-[10px] rounded-full flex items-center justify-center font-bold">
                      {totalFavorites > 9 ? "9+" : totalFavorites}
                    </span>
                  )}
                </Link>
                <div className="flex items-center gap-2 pl-2 border-l border-pink-100">
                  <Link href="/perfil" className="flex items-center gap-1.5 text-sm font-medium text-gray-700 hover:text-pink-600 transition-colors">
                    <div className="w-8 h-8 bg-gradient-to-br from-pink-400 to-rose-500 rounded-full flex items-center justify-center text-white text-xs font-bold">
                      {currentUser.name.charAt(0).toUpperCase()}
                    </div>
                    <span className="hidden sm:block max-w-[80px] truncate">{currentUser.name.split(" ")[0]}</span>
                  </Link>
                  <button onClick={logout} className="p-2 rounded-full hover:bg-red-50 transition-colors" title="Sair">
                    <LogOut className="w-4 h-4 text-gray-400 hover:text-red-400" />
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => openLoginModal()}
                className="flex items-center gap-1.5 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-4 py-2 rounded-full text-sm font-medium hover:from-pink-600 hover:to-rose-600 transition-all shadow-sm"
              >
                <User className="w-4 h-4" />
                <span>Entrar</span>
              </button>
            )}

            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="p-2 rounded-full hover:bg-pink-50 transition-colors md:hidden"
            >
              {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

        {/* Nav desktop — grupos com dropdown */}
        <nav className="hidden md:flex items-center gap-1 pb-2">
          <Link
            href="/"
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              pathname === "/" ? "bg-pink-100 text-pink-700" : "text-gray-600 hover:bg-pink-50 hover:text-pink-600"
            }`}
          >
            Início
          </Link>

          {groups.map((group) => (
            <GroupDropdown key={group} group={group} />
          ))}

          <Link
            href="/produtos"
            className={`px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
              pathname === "/produtos" ? "bg-pink-100 text-pink-700" : "text-gray-600 hover:bg-pink-50 hover:text-pink-600"
            }`}
          >
            Todos
          </Link>

          <Link
            href="/sugerir"
            className={`ml-auto flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors border ${
              pathname === "/sugerir"
                ? "bg-pink-100 border-pink-200 text-pink-700"
                : "border-pink-200 text-pink-600 hover:bg-pink-50"
            }`}
          >
            Sugira um produto
          </Link>
        </nav>
      </div>

      {/* Mobile menu */}
      {mobileMenuOpen && (
        <div className="md:hidden bg-white border-t border-pink-100 px-4 py-3 space-y-1">
          {/* Mobile search */}
          <form onSubmit={handleSearch} className="mb-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar produtos, marcas..."
                className="w-full pl-10 pr-4 py-2 rounded-full border border-pink-200 bg-pink-50/50 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
              />
            </div>
          </form>

          <Link href="/" onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-pink-50 hover:text-pink-600">
            Início
          </Link>

          {/* Grupos mobile com acordeão */}
          {groups.map((group) => (
            <div key={group}>
              <button
                onClick={() => setMobileGroupOpen(mobileGroupOpen === group ? null : group)}
                className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-semibold text-gray-700 hover:bg-pink-50 hover:text-pink-600"
              >
                <span>{group}</span>
                <ChevronDown className={`w-4 h-4 transition-transform ${mobileGroupOpen === group ? "rotate-180" : ""}`} />
              </button>

              {mobileGroupOpen === group && (
                <div className="ml-4 space-y-0.5 pb-1">
                  <Link href={`/produtos?grupo=${group}`} onClick={() => setMobileMenuOpen(false)}
                    className="block px-3 py-1.5 rounded-lg text-sm font-medium text-pink-600 hover:bg-pink-50">
                    Ver tudo em {group}
                  </Link>
                  {GROUP_CATEGORIES[group]
                    .filter(c => (productCountByCategory[c] ?? 0) > 0)
                    .map((cat) => (
                    <Link key={cat} href={`/produtos?categoria=${encodeURIComponent(cat)}`}
                      onClick={() => setMobileMenuOpen(false)}
                      className="block px-3 py-1.5 rounded-lg text-sm text-gray-600 hover:bg-pink-50 hover:text-pink-600">
                      {getCategoryDisplayName(cat)}
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ))}

          <Link href="/produtos" onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-pink-50 hover:text-pink-600">
            Todos os Produtos
          </Link>

          <Link href="/sugerir" onClick={() => setMobileMenuOpen(false)}
            className="block px-3 py-2 rounded-lg text-sm font-medium text-pink-600 hover:bg-pink-50 border border-pink-200 rounded-lg mt-1">
            Sugira um produto
          </Link>
        </div>
      )}
    </header>
  );
}
