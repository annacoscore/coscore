import Link from "next/link";

export default function NotFound() {
  return (
    <div className="max-w-7xl mx-auto px-4 py-20 text-center">
      <p className="text-8xl mb-4">🔍</p>
      <h1 className="text-3xl font-bold text-gray-900 mb-2">Página não encontrada</h1>
      <p className="text-gray-500 mb-8">O produto ou página que você procura não existe.</p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 text-white px-6 py-3 rounded-full font-semibold hover:from-pink-600 hover:to-rose-600 transition-all"
      >
        Voltar ao início
      </Link>
    </div>
  );
}
