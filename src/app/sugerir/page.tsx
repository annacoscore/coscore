"use client";

import { useActionState, useEffect, useRef } from "react";
import { Lightbulb, Send, CheckCircle, AlertCircle, Loader2 } from "lucide-react";
import { enviarSugestao, type SugestaoState } from "./actions";
import { Category, getCategoryDisplayName } from "@/types";

const CATEGORIAS: Category[] = [
  "Batom", "Base", "Máscara de Cílios", "Sombra", "Blush", "Iluminador",
  "Primer", "Contorno", "Sérum", "Hidratante", "Protetor Solar",
  "Tônico Facial", "Limpeza Facial", "Máscara Facial", "Esfoliante",
  "Creme para Olhos", "Perfume", "Perfume Homem", "Shampoo", "Condicionador",
  "Máscara Capilar", "Leave-in", "Óleo Capilar", "Tintura", "Finalizador", "Cabelo Homem",
];

const initialState: SugestaoState = { success: false, message: "" };

export default function SugerirPage() {
  const [state, action, isPending] = useActionState(enviarSugestao, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state.success]);

  return (
    <div className="min-h-screen bg-[#fdf8f6]">
      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-pink-100 rounded-2xl mb-4">
            <Lightbulb className="w-7 h-7 text-pink-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Sugira um produto</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Não achou o que procurava? Nos conta e iremos adicionar ao catálogo o mais rápido possível.
          </p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-8">
          <form ref={formRef} action={action} className="space-y-5">

            {/* Nome do produto */}
            <div>
              <label htmlFor="produto" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Nome do produto <span className="text-pink-500">*</span>
              </label>
              <input
                id="produto"
                name="produto"
                type="text"
                required
                placeholder="Ex: Batom Matte Ultimatte Avon"
                className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent text-sm placeholder:text-gray-400"
              />
            </div>

            {/* Marca */}
            <div>
              <label htmlFor="marca" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Marca <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <input
                id="marca"
                name="marca"
                type="text"
                placeholder="Ex: Avon, L'Oréal, Natura..."
                className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent text-sm placeholder:text-gray-400"
              />
            </div>

            {/* Categoria */}
            <div>
              <label htmlFor="categoria" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Categoria <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <select
                id="categoria"
                name="categoria"
                className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent text-sm text-gray-600"
              >
                <option value="">Selecione uma categoria...</option>
                {CATEGORIAS.map((cat) => (
                  <option key={cat} value={cat}>{getCategoryDisplayName(cat)}</option>
                ))}
              </select>
            </div>

            {/* Observação */}
            <div>
              <label htmlFor="observacao" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Observação <span className="text-gray-400 font-normal">(opcional)</span>
              </label>
              <textarea
                id="observacao"
                name="observacao"
                rows={3}
                placeholder="Onde você viu o produto? Tem algum link ou referência?"
                className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent text-sm placeholder:text-gray-400 resize-none"
              />
            </div>

            {/* Email do usuário */}
            <div>
              <label htmlFor="emailUsuario" className="block text-sm font-semibold text-gray-700 mb-1.5">
                Seu email <span className="text-gray-400 font-normal">(opcional — para te avisar quando o produto for adicionado)</span>
              </label>
              <input
                id="emailUsuario"
                name="emailUsuario"
                type="email"
                placeholder="seuemail@exemplo.com"
                className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:border-transparent text-sm placeholder:text-gray-400"
              />
            </div>

            {/* Feedback */}
            {state.message && (
              <div
                className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                  state.success
                    ? "bg-green-50 border border-green-200 text-green-700"
                    : "bg-red-50 border border-red-200 text-red-600"
                }`}
              >
                {state.success
                  ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                {state.message}
              </div>
            )}

            {/* Botão */}
            <button
              type="submit"
              disabled={isPending}
              className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
            >
              {isPending ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Enviando...
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" />
                  Enviar sugestão
                </>
              )}
            </button>
          </form>
        </div>

        {/* Rodapé informativo */}
        <p className="text-center text-xs text-gray-400 mt-6">
          Todas as sugestões são revisadas pela equipe CoScore. Não garantimos prazo de adição, mas lemos tudo! 💜
        </p>
      </div>
    </div>
  );
}
