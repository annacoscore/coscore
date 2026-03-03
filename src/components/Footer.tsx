import Link from "next/link";
import Image from "next/image";

export default function Footer() {
  return (
    <footer className="bg-white border-t border-pink-100 mt-16">
      <div className="max-w-7xl mx-auto px-4 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          {/* Brand */}
          <div className="md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5 mb-3">
              <Image src="/logo.png" alt="CoScore" width={34} height={34} className="rounded-xl" />
              <span className="logo-wordmark text-[1.15rem]">
                <span className="logo-wordmark-co">Co</span><span className="logo-wordmark-score">Score</span>
              </span>
            </Link>
            <p className="text-sm text-gray-500 leading-relaxed">
              Reviews honestas e comparação de preços para você fazer a melhor escolha nos cosméticos.
            </p>
          </div>

          {/* Categorias */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">Categorias</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              {["Maquiagem", "Skincare", "Cabelo", "Perfumes"].map((grupo) => (
                <li key={grupo}>
                  <Link href={`/produtos?grupo=${grupo}`} className="hover:text-pink-600 transition-colors">
                    {grupo}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          {/* Site */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">CoScore</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><Link href="/" className="hover:text-pink-600 transition-colors">Início</Link></li>
              <li><Link href="/produtos" className="hover:text-pink-600 transition-colors">Todos os Produtos</Link></li>
              <li><Link href="/favoritos" className="hover:text-pink-600 transition-colors">Meus Favoritos</Link></li>
              <li><Link href="/perfil" className="hover:text-pink-600 transition-colors">Meu Perfil</Link></li>
            </ul>
          </div>

          {/* Legal */}
          <div>
            <h4 className="font-semibold text-gray-800 mb-3">Informações</h4>
            <ul className="space-y-2 text-sm text-gray-500">
              <li><a href="#" className="hover:text-pink-600 transition-colors">Sobre Nós</a></li>
              <li><a href="#" className="hover:text-pink-600 transition-colors">Política de Privacidade</a></li>
              <li><a href="#" className="hover:text-pink-600 transition-colors">Termos de Uso</a></li>
              <li><a href="#" className="hover:text-pink-600 transition-colors">Anuncie Conosco</a></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-pink-100 mt-8 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-sm text-gray-400">
            © 2026 CoScore. Todos os direitos reservados.
          </p>
          <p className="text-xs text-gray-400">
            Os preços são atualizados periodicamente e podem sofrer alterações.
          </p>
        </div>
      </div>
    </footer>
  );
}
