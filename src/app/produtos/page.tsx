"use client";
import { useState, useMemo, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { SlidersHorizontal, X, ChevronDown, ChevronRight, Search } from "lucide-react";
import ProductCard from "@/components/ProductCard";
import AdBanner from "@/components/AdBanner";
import { products } from "@/data/products";
import { Category, CategoryGroup, GROUP_CATEGORIES, CATEGORY_GROUPS, getCategoryDisplayName } from "@/types";
import { Suspense } from "react";

const brands = [...new Set(products.map((p) => p.brand))].sort();

// Quantidade de produtos por categoria (para esconder categorias vazias no sidebar)
const productCountByCategory = products.reduce<Record<string, number>>((acc, p) => {
  acc[p.category] = (acc[p.category] ?? 0) + 1;
  return acc;
}, {});

type SortOption = "relevancia" | "avaliacao" | "menor-preco" | "maior-preco" | "mais-reviews";


function ProductsContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [inputQuery, setInputQuery] = useState(""); // campo de busca local

  const [selectedGroup, setSelectedGroup] = useState<CategoryGroup | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<Category[]>([]);
  const [selectedBrands, setSelectedBrands] = useState<string[]>([]);
  const [minRating, setMinRating] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>("relevancia");
  const [searchQuery, setSearchQuery] = useState("");
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [maxPrice, setMaxPrice] = useState(500);
  const [expandedGroups, setExpandedGroups] = useState<Record<CategoryGroup, boolean>>({
    Maquiagem: true,
    Skincare: true,
    Cabelo: true,
    Perfumes: true,
  });

  // Sincroniza os filtros sempre que os parâmetros da URL mudarem
  // (inclui navegação via Header enquanto já está na página /produtos)
  useEffect(() => {
    const cat = searchParams.get("categoria") as Category | null;
    const grp = searchParams.get("grupo") as CategoryGroup | null;
    const q   = searchParams.get("q") || "";

    setSearchQuery(q);
    setInputQuery(q); // sincroniza o campo de texto local

    if (cat) {
      setSelectedCategories([cat]);
      setSelectedGroup(CATEGORY_GROUPS[cat] ?? null);
    } else if (grp) {
      setSelectedGroup(grp);
      setSelectedCategories([]);
    } else {
      setSelectedGroup(null);
      setSelectedCategories([]);
    }
  }, [searchParams]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = inputQuery.trim();
    if (q) {
      router.push(`/produtos?q=${encodeURIComponent(q)}`);
    } else {
      router.push("/produtos");
    }
  };

  const toggleGroup = (group: CategoryGroup) => {
    if (selectedGroup === group) {
      setSelectedGroup(null);
      setSelectedCategories([]);
    } else {
      setSelectedGroup(group);
      setSelectedCategories([]);
    }
  };

  const toggleExpandGroup = (group: CategoryGroup) => {
    setExpandedGroups((prev) => ({ ...prev, [group]: !prev[group] }));
  };

  const toggleCategory = (cat: Category) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
    // Ao selecionar uma subcategoria, ativa o grupo pai automaticamente
    setSelectedGroup(CATEGORY_GROUPS[cat]);
  };

  const toggleBrand = (brand: string) => {
    setSelectedBrands((prev) =>
      prev.includes(brand) ? prev.filter((b) => b !== brand) : [...prev, brand]
    );
  };

  const clearFilters = () => {
    setSelectedGroup(null);
    setSelectedCategories([]);
    setSelectedBrands([]);
    setMinRating(0);
    setMaxPrice(500);
  };

  const filtered = useMemo(() => {
    let result = [...products];

    if (searchQuery) {
      // Busca textual: pesquisa em todos os produtos, ignora filtros de categoria
      const q = searchQuery.toLowerCase().trim();
      result = result.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.brand.toLowerCase().includes(q) ||
          p.category.toLowerCase().includes(q) ||
          p.description.toLowerCase().includes(q) ||
          p.tags.some((t) => t.toLowerCase().includes(q))
      );
    } else {
      // Sem busca textual: aplica filtros de categoria normalmente
      if (selectedGroup && selectedCategories.length === 0) {
        result = result.filter((p) => CATEGORY_GROUPS[p.category] === selectedGroup);
      }

      if (selectedCategories.length > 0) {
        result = result.filter((p) => selectedCategories.includes(p.category));
      }
    }

    if (selectedBrands.length > 0) {
      result = result.filter((p) => selectedBrands.includes(p.brand));
    }

    if (minRating > 0) {
      result = result.filter((p) => p.averageRating >= minRating);
    }

    result = result.filter((p) => {
      if (p.prices.length === 0) return true;
      const lowest = Math.min(...p.prices.map((pr) => pr.price));
      return lowest <= maxPrice;
    });

    switch (sortBy) {
      case "avaliacao":
        result.sort((a, b) => b.averageRating - a.averageRating);
        break;
      case "menor-preco":
        result.sort(
          (a, b) =>
            (a.prices.length ? Math.min(...a.prices.map((p) => p.price)) : 999) -
            (b.prices.length ? Math.min(...b.prices.map((p) => p.price)) : 999)
        );
        break;
      case "maior-preco":
        result.sort(
          (a, b) =>
            (b.prices.length ? Math.min(...b.prices.map((p) => p.price)) : 0) -
            (a.prices.length ? Math.min(...a.prices.map((p) => p.price)) : 0)
        );
        break;
      case "mais-reviews":
        result.sort((a, b) => b.reviewCount - a.reviewCount);
        break;
      default:
        break;
    }

    // Produtos masculinos (Cabelo Homem, Perfume Homem) sempre por último — foco do site é público feminino
    const MASCULINE_CATEGORIES: Category[] = ["Cabelo Homem", "Perfume Homem"];
    const rest = result.filter((p) => !MASCULINE_CATEGORIES.includes(p.category));
    const masculine = result.filter((p) => MASCULINE_CATEGORIES.includes(p.category));
    return [...rest, ...masculine];
  }, [searchQuery, selectedGroup, selectedCategories, selectedBrands, minRating, maxPrice, sortBy]);

  const hasActiveFilters =
    selectedGroup !== null || selectedCategories.length > 0 || selectedBrands.length > 0 || minRating > 0;

  // Título dinâmico
  const pageTitle = searchQuery
    ? `Resultados para "${searchQuery}"`
    : selectedCategories.length === 1
    ? getCategoryDisplayName(selectedCategories[0])
    : selectedGroup
    ? selectedGroup
    : "Todos os Produtos";

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      {/* Barra de busca da página */}
      <form onSubmit={handleSearchSubmit} className="mb-6">
        <div className="relative max-w-xl">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input
            type="text"
            value={inputQuery}
            onChange={(e) => setInputQuery(e.target.value)}
            placeholder="Buscar por produto, marca ou categoria..."
            className="w-full pl-11 pr-10 py-2.5 rounded-full border border-pink-200 bg-pink-50/50 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
          />
          {inputQuery && (
            <button
              type="button"
              onClick={() => { setInputQuery(""); router.push("/produtos"); }}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </form>

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">{pageTitle}</h1>
          <p className="text-sm text-gray-500 mt-1">
            {filtered.length} produto{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative hidden sm:block">
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as SortOption)}
              className="appearance-none pl-3 pr-8 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-pink-300 cursor-pointer"
            >
              <option value="relevancia">Relevância</option>
              <option value="avaliacao">Melhor Avaliação</option>
              <option value="mais-reviews">Mais Avaliados</option>
              <option value="menor-preco">Menor Preço</option>
              <option value="maior-preco">Maior Preço</option>
            </select>
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
          </div>

          <button
            onClick={() => setFiltersOpen(!filtersOpen)}
            className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-xl text-sm text-gray-700 hover:border-pink-300 transition-colors lg:hidden"
          >
            <SlidersHorizontal className="w-4 h-4" />
            Filtros
            {hasActiveFilters && (
              <span className="w-5 h-5 bg-pink-500 text-white text-xs rounded-full flex items-center justify-center">
                {selectedCategories.length + selectedBrands.length + (minRating > 0 ? 1 : 0) + (selectedGroup && selectedCategories.length === 0 ? 1 : 0)}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className="flex gap-6">
        {/* Sidebar */}
        <aside className={`w-64 shrink-0 ${filtersOpen ? "block" : "hidden"} lg:block`}>
          <div className="bg-white rounded-2xl border border-pink-50 p-5 sticky top-20 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-gray-900">Filtros</h3>
              {hasActiveFilters && (
                <button onClick={clearFilters} className="text-xs text-pink-500 hover:underline flex items-center gap-1">
                  <X className="w-3 h-3" /> Limpar
                </button>
              )}
            </div>

            {/* Grupos + Subcategorias */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3">Categoria</h4>
              <div className="space-y-1">
                {(Object.entries(GROUP_CATEGORIES) as [CategoryGroup, Category[]][]).map(([group, cats]) => {
                  // Mostra apenas subcategorias que têm pelo menos 1 produto
                  const availableCats = cats.filter(c => (productCountByCategory[c] ?? 0) > 0);
                  if (availableCats.length === 0) return null;
                  return (
                  <div key={group}>
                    {/* Grupo pai */}
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleGroup(group)}
                        className={`flex-1 flex items-center gap-2 px-2 py-1.5 rounded-lg text-sm font-semibold transition-colors text-left ${
                          selectedGroup === group
                            ? "bg-pink-100 text-pink-700"
                            : "text-gray-700 hover:bg-pink-50 hover:text-pink-600"
                        }`}
                      >
                        {group}
                      </button>
                      <button
                        onClick={() => toggleExpandGroup(group)}
                        className="p-1 text-gray-400 hover:text-pink-500 transition-colors"
                      >
                        {expandedGroups[group]
                          ? <ChevronDown className="w-3.5 h-3.5" />
                          : <ChevronRight className="w-3.5 h-3.5" />
                        }
                      </button>
                    </div>

                    {/* Subcategorias com produtos */}
                    {expandedGroups[group] && (
                      <div className="ml-4 mt-1 space-y-0.5">
                        {availableCats.map((cat) => (
                          <label key={cat} className="flex items-center gap-2 cursor-pointer group px-2 py-1 rounded-lg hover:bg-pink-50">
                            <input
                              type="checkbox"
                              checked={selectedCategories.includes(cat)}
                              onChange={() => toggleCategory(cat)}
                              className="w-3.5 h-3.5 accent-pink-500 rounded"
                            />
                            <span className={`text-sm transition-colors ${
                              selectedCategories.includes(cat) ? "text-pink-600 font-medium" : "text-gray-600 group-hover:text-pink-600"
                            }`}>
                              {getCategoryDisplayName(cat)}
                              <span className="ml-1 text-[10px] text-gray-400">({productCountByCategory[cat] ?? 0})</span>
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                  );
                })}
              </div>
            </div>

            {/* Marcas */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Marca</h4>
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {brands.map((brand) => (
                  <label key={brand} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="checkbox"
                      checked={selectedBrands.includes(brand)}
                      onChange={() => toggleBrand(brand)}
                      className="w-4 h-4 accent-pink-500 rounded"
                    />
                    <span className="text-sm text-gray-600 group-hover:text-pink-600 transition-colors">
                      {brand}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Avaliação */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">Avaliação Mínima</h4>
              <div className="space-y-1.5">
                {[4, 3, 2, 0].map((r) => (
                  <label key={r} className="flex items-center gap-2 cursor-pointer group">
                    <input
                      type="radio"
                      name="rating"
                      checked={minRating === r}
                      onChange={() => setMinRating(r)}
                      className="w-4 h-4 accent-pink-500"
                    />
                    <span className="text-sm text-gray-600 group-hover:text-pink-600">
                      {r === 0 ? "Todos" : `${r}+ estrelas`}
                    </span>
                  </label>
                ))}
              </div>
            </div>

            {/* Preço */}
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-2">
                Preço máximo: <span className="text-pink-600">R$ {maxPrice}</span>
              </h4>
              <input
                type="range"
                min={10}
                max={500}
                step={10}
                value={maxPrice}
                onChange={(e) => setMaxPrice(Number(e.target.value))}
                className="w-full accent-pink-500"
              />
              <div className="flex justify-between text-xs text-gray-400 mt-1">
                <span>R$ 10</span>
                <span>R$ 500</span>
              </div>
            </div>
          </div>
        </aside>

        {/* Grid de produtos */}
        <div className="flex-1 min-w-0">
          {/* Tags de filtros ativos */}
          {hasActiveFilters && (
            <div className="flex flex-wrap gap-2 mb-4">
              {selectedGroup && selectedCategories.length === 0 && (
                <button
                  onClick={() => setSelectedGroup(null)}
                  className="flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-medium hover:bg-pink-200 transition-colors"
                >
                  {selectedGroup} <X className="w-3 h-3" />
                </button>
              )}
              {selectedCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => toggleCategory(cat)}
                  className="flex items-center gap-1 px-3 py-1 bg-pink-100 text-pink-700 rounded-full text-xs font-medium hover:bg-pink-200 transition-colors"
                >
                  {getCategoryDisplayName(cat)} <X className="w-3 h-3" />
                </button>
              ))}
              {selectedBrands.map((brand) => (
                <button
                  key={brand}
                  onClick={() => toggleBrand(brand)}
                  className="flex items-center gap-1 px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-medium hover:bg-purple-200 transition-colors"
                >
                  {brand} <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}

          {/* Navegação rápida por grupo (quando nenhum filtro ativo) */}
          {!hasActiveFilters && !searchQuery && (
            <div className="flex gap-3 mb-6">
              {(Object.keys(GROUP_CATEGORIES) as CategoryGroup[]).map((group) => (
                <button
                  key={group}
                  onClick={() => toggleGroup(group)}
                  className="flex items-center gap-2 px-4 py-2 rounded-full border border-pink-200 text-sm font-medium text-gray-700 hover:bg-pink-50 hover:border-pink-400 hover:text-pink-600 transition-all"
                >
                  {group}
                </button>
              ))}
            </div>
          )}

          {filtered.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-4xl mb-3">🔍</p>
              <p className="text-gray-500 font-medium">Nenhum produto encontrado</p>
              <p className="text-sm text-gray-400 mt-1">Tente ajustar os filtros ou buscar por outros termos</p>
              <button onClick={clearFilters} className="mt-4 text-sm text-pink-500 hover:underline">
                Limpar filtros
              </button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.slice(0, 8).map((product) => (
                  <ProductCard key={product.id} product={product} />
                ))}
              </div>

              {filtered.length > 8 && (
                <>
                  <div className="my-6">
                    <AdBanner size="leaderboard" />
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-4">
                    {filtered.slice(8).map((product) => (
                      <ProductCard key={product.id} product={product} />
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export default function ProdutosPage() {
  return (
    <Suspense fallback={<div className="p-8 text-center text-gray-400">Carregando...</div>}>
      <ProductsContent />
    </Suspense>
  );
}
