"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Lightbulb, Send, CheckCircle, AlertCircle, Loader2,
  Plus, Link as LinkIcon, Sparkles, Star, ArrowRight, Package,
} from "lucide-react";
import { enviarSugestao, type SugestaoState } from "./actions";
import { Category, getCategoryDisplayName, Product } from "@/types";
import { useStore } from "@/store/useStore";

const CATEGORIAS: Category[] = [
  "Batom", "Gloss", "Base", "Máscara de Cílios", "Sombra", "Blush", "Iluminador",
  "Primer", "Contorno/Bronzer", "Sérum", "Hidratante", "Protetor Solar",
  "Tônico Facial", "Limpeza Facial", "Máscara Facial", "Esfoliante",
  "Creme para Olhos", "Perfume Feminino", "Perfume Masculino", "Shampoo", "Condicionador",
  "Máscara Capilar", "Leave-in", "Óleo Capilar", "Tintura", "Finalizador", "Cabelo Homem",
];

const initialState: SugestaoState = { success: false, message: "" };

type CreateStep = "idle" | "analyzing" | "preview" | "error";

interface CreateState {
  step: CreateStep;
  product?: Product;
  error?: string;
}

export default function SugerirPage() {
  const [tab, setTab] = useState<"sugira" | "crie">("sugira");

  // ── aba "Sugira" ──
  const [state, action, isPending] = useActionState(enviarSugestao, initialState);
  const formRef = useRef<HTMLFormElement>(null);
  useEffect(() => { if (state.success) formRef.current?.reset(); }, [state.success]);

  // ── aba "Crie" ──
  const router = useRouter();
  const { addUserProduct, currentUser, openLoginModal } = useStore();
  const [createName, setCreateName] = useState("");
  const [createUrl, setCreateUrl] = useState("");
  const [createState, setCreateState] = useState<CreateState>({ step: "idle" });

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) {
      openLoginModal("Faça login para adicionar um produto.");
      return;
    }
    setCreateState({ step: "analyzing" });

    try {
      const res = await fetch("/api/create-product", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: createName, url: createUrl }),
      });
      const data = await res.json();

      if (!data.ok) {
        setCreateState({ step: "error", error: data.error });
      } else {
        setCreateState({ step: "preview", product: data.product });
      }
    } catch {
      setCreateState({ step: "error", error: "Erro de conexão. Tente novamente." });
    }
  };

  const handleConfirm = () => {
    if (!createState.product) return;
    addUserProduct(createState.product);
    router.push(`/produto/${createState.product.id}`);
  };

  const handleReset = () => {
    setCreateState({ step: "idle" });
  };

  return (
    <div className="min-h-screen bg-[#fdf8f6]">
      <div className="max-w-2xl mx-auto px-4 py-12">

        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-pink-100 rounded-2xl mb-4">
            <Lightbulb className="w-7 h-7 text-pink-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Produtos</h1>
          <p className="text-gray-500 text-sm leading-relaxed max-w-sm mx-auto">
            Não achou o produto? Sugira para nossa equipe ou adicione você mesma agora.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6 bg-white rounded-2xl p-1.5 border border-pink-100 shadow-sm">
          <button
            onClick={() => setTab("sugira")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "sugira"
                ? "bg-gradient-to-r from-pink-500 to-rose-500 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Send className="w-4 h-4" />
            Sugira um produto
          </button>
          <button
            onClick={() => setTab("crie")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-all ${
              tab === "crie"
                ? "bg-gradient-to-r from-violet-500 to-purple-600 text-white shadow-sm"
                : "text-gray-500 hover:text-gray-700"
            }`}
          >
            <Plus className="w-4 h-4" />
            Crie seu produto
          </button>
        </div>

        {/* ── Aba: Sugira ── */}
        {tab === "sugira" && (
          <div className="bg-white rounded-2xl border border-pink-100 shadow-sm p-8">
            <form ref={formRef} action={action} className="space-y-5">
              <div>
                <label htmlFor="produto" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Nome do produto <span className="text-pink-500">*</span>
                </label>
                <input
                  id="produto" name="produto" type="text" required
                  placeholder="Ex: Batom Matte Ultimatte Avon"
                  className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm placeholder:text-gray-400"
                />
              </div>
              <div>
                <label htmlFor="marca" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Marca <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  id="marca" name="marca" type="text"
                  placeholder="Ex: Avon, L'Oréal, Natura..."
                  className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm placeholder:text-gray-400"
                />
              </div>
              <div>
                <label htmlFor="categoria" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Categoria <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <select
                  id="categoria" name="categoria"
                  className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm text-gray-600"
                >
                  <option value="">Selecione uma categoria...</option>
                  {CATEGORIAS.map((cat) => (
                    <option key={cat} value={cat}>{getCategoryDisplayName(cat)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="observacao" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Observação <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <textarea
                  id="observacao" name="observacao" rows={3}
                  placeholder="Onde você viu o produto? Tem algum link ou referência?"
                  className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm placeholder:text-gray-400 resize-none"
                />
              </div>
              <div>
                <label htmlFor="emailUsuario" className="block text-sm font-semibold text-gray-700 mb-1.5">
                  Seu email <span className="text-gray-400 font-normal">(opcional)</span>
                </label>
                <input
                  id="emailUsuario" name="emailUsuario" type="email"
                  placeholder="seuemail@exemplo.com"
                  className="w-full px-4 py-2.5 rounded-xl border border-pink-200 bg-pink-50/30 focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm placeholder:text-gray-400"
                />
              </div>
              {state.message && (
                <div className={`flex items-start gap-3 px-4 py-3 rounded-xl text-sm font-medium ${
                  state.success ? "bg-green-50 border border-green-200 text-green-700"
                                : "bg-red-50 border border-red-200 text-red-600"
                }`}>
                  {state.success ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" />
                                 : <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />}
                  {state.message}
                </div>
              )}
              <button
                type="submit" disabled={isPending}
                className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 disabled:opacity-60 text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
              >
                {isPending ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                           : <><Send className="w-4 h-4" /> Enviar sugestão</>}
              </button>
            </form>
          </div>
        )}

        {/* ── Aba: Crie seu produto ── */}
        {tab === "crie" && (
          <div>
            {/* Formulário inicial */}
            {createState.step === "idle" && (
              <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-10 h-10 bg-violet-100 rounded-xl flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-violet-600" />
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900">Adicionar produto ao CoScore</h2>
                    <p className="text-xs text-gray-400 mt-0.5">
                      Cole o link ou digite o nome e a IA verifica e cria a página.
                    </p>
                  </div>
                </div>

                <form onSubmit={handleCreate} className="space-y-5">
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Nome do produto <span className="text-violet-500">*</span>
                    </label>
                    <input
                      type="text" required value={createName}
                      onChange={(e) => setCreateName(e.target.value)}
                      placeholder="Ex: Base Ruby Rose HD Skin"
                      className="w-full px-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm placeholder:text-gray-400"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-gray-700 mb-1.5">
                      Link do produto
                      <span className="ml-1 text-gray-400 font-normal">(opcional — Mercado Livre, Amazon, etc.)</span>
                    </label>
                    <div className="relative">
                      <LinkIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <input
                        type="url" value={createUrl}
                        onChange={(e) => setCreateUrl(e.target.value)}
                        placeholder="https://www.mercadolivre.com.br/..."
                        className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-violet-200 bg-violet-50/30 focus:outline-none focus:ring-2 focus:ring-violet-300 text-sm placeholder:text-gray-400"
                      />
                    </div>
                    <p className="text-xs text-gray-400 mt-1.5">
                      Links do Mercado Livre carregam fotos e dados automaticamente.
                    </p>
                  </div>

                  {!currentUser && (
                    <div className="flex items-center gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
                      <AlertCircle className="w-4 h-4 shrink-0" />
                      Você precisa estar logada para criar um produto.
                    </div>
                  )}

                  <button
                    type="submit"
                    className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold py-3 rounded-xl transition-all shadow-sm"
                  >
                    <Sparkles className="w-4 h-4" />
                    Verificar e criar produto
                  </button>
                </form>
              </div>
            )}

            {/* Analisando */}
            {createState.step === "analyzing" && (
              <div className="bg-white rounded-2xl border border-violet-100 shadow-sm p-10 text-center">
                <div className="w-16 h-16 bg-violet-100 rounded-full flex items-center justify-center mx-auto mb-5">
                  <Loader2 className="w-8 h-8 text-violet-500 animate-spin" />
                </div>
                <h2 className="font-bold text-gray-900 mb-2">Analisando produto...</h2>
                <div className="space-y-2 text-sm text-gray-500 mt-4">
                  <p className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-violet-400 animate-pulse" />
                    Buscando no catálogo do Mercado Livre
                  </p>
                  <p className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-violet-400 animate-pulse" />
                    Verificando se é um cosmético
                  </p>
                  <p className="flex items-center justify-center gap-2">
                    <CheckCircle className="w-4 h-4 text-violet-400 animate-pulse" />
                    Detectando variações de cor
                  </p>
                </div>
              </div>
            )}

            {/* Erro */}
            {createState.step === "error" && (
              <div className="bg-white rounded-2xl border border-red-100 shadow-sm p-8 text-center">
                <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <AlertCircle className="w-7 h-7 text-red-500" />
                </div>
                <h2 className="font-bold text-gray-900 mb-2">Não foi possível adicionar</h2>
                <p className="text-sm text-gray-500 mb-6">{createState.error}</p>
                <button
                  onClick={handleReset}
                  className="px-6 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl text-sm transition-colors"
                >
                  Tentar novamente
                </button>
              </div>
            )}

            {/* Preview do produto */}
            {createState.step === "preview" && createState.product && (
              <div className="space-y-4">
                {/* Card validação */}
                <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4">
                  <p className="text-sm font-bold text-emerald-800 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" /> Produto verificado com sucesso!
                  </p>
                  <div className="space-y-1">
                    <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> É um cosmético de beleza
                    </p>
                    <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle className="w-3.5 h-3.5" /> Dados carregados do Mercado Livre
                    </p>
                    {createState.product.colors && createState.product.colors.length > 0 && (
                      <p className="text-xs text-emerald-700 flex items-center gap-1.5">
                        <CheckCircle className="w-3.5 h-3.5" />
                        {createState.product.colors.length} variação(ões) de cor detectada(s)
                      </p>
                    )}
                  </div>
                </div>

                {/* Card produto */}
                <div className="bg-white rounded-2xl border border-violet-100 shadow-sm overflow-hidden">
                  <div className="bg-gradient-to-r from-violet-500 to-purple-600 px-5 py-3">
                    <span className="text-white text-xs font-medium flex items-center gap-1.5">
                      <Sparkles className="w-3.5 h-3.5" /> Prévia do produto
                    </span>
                  </div>

                  <div className="p-5">
                    <div className="flex gap-4">
                      {/* Imagem */}
                      <div className="w-24 h-24 bg-gray-50 rounded-xl overflow-hidden shrink-0 border border-gray-100">
                        {createState.product.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={createState.product.image}
                            alt={createState.product.name}
                            className="w-full h-full object-contain p-2"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Package className="w-8 h-8 text-gray-300" />
                          </div>
                        )}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <span className="inline-block text-xs bg-violet-100 text-violet-700 px-2 py-0.5 rounded-full font-medium mb-1">
                          {getCategoryDisplayName(createState.product.category as Category)}
                        </span>
                        <p className="text-xs font-semibold text-violet-600">{createState.product.brand}</p>
                        <p className="font-bold text-gray-900 text-sm leading-tight mt-0.5">
                          {createState.product.name}
                        </p>
                        <div className="flex items-center gap-1 mt-1.5">
                          {[1,2,3,4,5].map(s => (
                            <Star key={s} className="w-3 h-3 text-gray-200" />
                          ))}
                          <span className="text-xs text-gray-400 ml-1">Sem avaliações ainda</span>
                        </div>
                      </div>
                    </div>

                    {/* Fotos */}
                    {createState.product.images && createState.product.images.length > 1 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">{createState.product.images.length} fotos carregadas</p>
                        <div className="flex gap-2 flex-wrap">
                          {createState.product.images.slice(0, 5).map((img, i) => (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img key={i} src={img} alt="" className="w-12 h-12 object-contain bg-gray-50 rounded-lg border border-gray-100 p-1" />
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Variações de cor */}
                    {createState.product.colors && createState.product.colors.length > 0 && (
                      <div className="mt-4">
                        <p className="text-xs font-semibold text-gray-500 mb-2">Cores detectadas</p>
                        <div className="flex flex-wrap gap-1.5">
                          {createState.product.colors.map((c) => (
                            <span key={c.name} className="text-xs bg-pink-50 border border-pink-200 text-pink-700 px-2.5 py-1 rounded-full font-medium">
                              {c.name}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {createState.product.description && (
                      <p className="text-xs text-gray-500 mt-4 line-clamp-3 leading-relaxed border-t border-gray-50 pt-3">
                        {createState.product.description}
                      </p>
                    )}
                  </div>
                </div>

                {/* Ações */}
                <div className="flex gap-3">
                  <button
                    onClick={handleReset}
                    className="flex-1 py-3 border border-gray-200 text-gray-600 font-medium rounded-xl text-sm hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    onClick={handleConfirm}
                    className="flex-1 flex items-center justify-center gap-2 py-3 bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white font-semibold rounded-xl text-sm transition-all shadow-sm"
                  >
                    Confirmar e ir para a página
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Rodapé */}
        <p className="text-center text-xs text-gray-400 mt-6">
          {tab === "sugira"
            ? "Todas as sugestões são revisadas pela equipe CoScore. 💜"
            : "Produtos criados pela comunidade ficam disponíveis para todos avaliarem."}
        </p>
      </div>
    </div>
  );
}
