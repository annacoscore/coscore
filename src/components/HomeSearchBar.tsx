"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Search } from "lucide-react";

export default function HomeSearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const q = query.trim();
    if (q) {
      router.push(`/produtos?q=${encodeURIComponent(q)}`);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-xl mb-8">
      <div className="relative flex items-center">
        <Search className="absolute left-4 w-5 h-5 text-pink-400 pointer-events-none" />
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Digite o produto ou marca que deseja encontrar"
          className="w-full pl-12 pr-4 py-3.5 rounded-full bg-white/95 text-gray-800 placeholder-gray-400 text-sm font-medium shadow-lg focus:outline-none focus:ring-2 focus:ring-pink-300"
        />
        <button
          type="submit"
          className="absolute right-2 bg-pink-500 hover:bg-pink-600 text-white text-sm font-semibold px-5 py-2 rounded-full transition-colors"
        >
          Buscar
        </button>
      </div>
    </form>
  );
}
