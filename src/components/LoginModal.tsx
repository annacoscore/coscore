"use client";
import { useState } from "react";
import { X, Eye, EyeOff, Sparkles, Loader2, ArrowLeft, Mail, CheckCircle } from "lucide-react";
import { useStore } from "@/store/useStore";

type Screen = "login" | "register" | "forgot" | "forgot-sent";

export default function LoginModal() {
  const { isLoginModalOpen, closeLoginModal, login, register, loginRedirectMessage } = useStore();
  const [screen, setScreen] = useState<Screen>("login");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [loginForm, setLoginForm] = useState({ email: "", password: "" });
  const [registerForm, setRegisterForm] = useState({ name: "", email: "", password: "", confirm: "" });
  const [forgotEmail, setForgotEmail] = useState("");

  if (!isLoginModalOpen) return null;

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const ok = login(loginForm.email, loginForm.password);
    if (!ok) setError("E-mail ou senha incorretos.");
    setLoading(false);
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (registerForm.password !== registerForm.confirm) {
      setError("As senhas não coincidem.");
      return;
    }
    if (registerForm.password.length < 6) {
      setError("A senha deve ter pelo menos 6 caracteres.");
      return;
    }
    setLoading(true);
    await new Promise((r) => setTimeout(r, 600));
    const ok = register(registerForm.name, registerForm.email, registerForm.password);
    if (!ok) setError("Este e-mail já está cadastrado.");
    setLoading(false);
  };

  const handleForgot = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    await new Promise((r) => setTimeout(r, 800));
    setLoading(false);
    setScreen("forgot-sent");
  };

  const goTo = (s: Screen) => {
    setScreen(s);
    setError("");
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeLoginModal}
      />

      {/* Modal */}
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header gradient */}
        <div className="bg-gradient-to-r from-pink-500 to-rose-500 px-6 py-5 text-white">
          <button
            onClick={closeLoginModal}
            className="absolute top-4 right-4 p-1 rounded-full bg-white/20 hover:bg-white/30 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="flex items-center gap-2 mb-1">
            <Sparkles className="w-5 h-5" />
            <span className="font-bold text-lg">CoScore</span>
          </div>
          <p className="text-pink-100 text-sm">
            {screen === "login"       && (loginRedirectMessage || "Bem-vinda de volta!")}
            {screen === "register"    && "Crie sua conta gratuita"}
            {screen === "forgot"      && "Recuperar senha"}
            {screen === "forgot-sent" && "E-mail enviado!"}
          </p>
        </div>

        {/* Tabs — só aparece nas telas de login/register */}
        {(screen === "login" || screen === "register") && (
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => goTo("login")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                screen === "login"
                  ? "text-pink-600 border-b-2 border-pink-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Entrar
            </button>
            <button
              onClick={() => goTo("register")}
              className={`flex-1 py-3 text-sm font-medium transition-colors ${
                screen === "register"
                  ? "text-pink-600 border-b-2 border-pink-500"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              Criar Conta
            </button>
          </div>
        )}

        <div className="px-6 py-5">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-600">
              {error}
            </div>
          )}

          {/* ── Tela de Login ── */}
          {screen === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={loginForm.email}
                  onChange={(e) => setLoginForm({ ...loginForm, email: e.target.value })}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-gray-700">Senha</label>
                  <button
                    type="button"
                    onClick={() => goTo("forgot")}
                    className="text-xs text-pink-500 hover:text-pink-700 hover:underline transition-colors"
                  >
                    Esqueci minha senha
                  </button>
                </div>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={loginForm.password}
                    onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                    placeholder="Sua senha"
                    className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-3 rounded-xl font-medium hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Entrando..." : "Entrar"}
              </button>
              <p className="text-xs text-gray-400 text-center">
                Teste: julia@coscore.com / 123456
              </p>
            </form>
          )}

          {/* ── Tela de Cadastro ── */}
          {screen === "register" && (
            <form onSubmit={handleRegister} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Nome</label>
                <input
                  type="text"
                  required
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  placeholder="Seu nome"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Senha</label>
                <div className="relative">
                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full px-4 py-2.5 pr-10 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Confirmar Senha</label>
                <input
                  type="password"
                  required
                  value={registerForm.confirm}
                  onChange={(e) => setRegisterForm({ ...registerForm, confirm: e.target.value })}
                  placeholder="Repita a senha"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-3 rounded-xl font-medium hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {loading ? "Criando conta..." : "Criar Conta Grátis"}
              </button>
            </form>
          )}

          {/* ── Tela de Recuperação de Senha ── */}
          {screen === "forgot" && (
            <form onSubmit={handleForgot} className="space-y-4">
              <button
                type="button"
                onClick={() => goTo("login")}
                className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-pink-600 transition-colors mb-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Voltar ao login
              </button>
              <p className="text-sm text-gray-600">
                Digite o e-mail cadastrado e enviaremos um link para você criar uma nova senha.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  value={forgotEmail}
                  onChange={(e) => setForgotEmail(e.target.value)}
                  placeholder="seu@email.com"
                  className="w-full px-4 py-2.5 border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-300 text-sm"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-gradient-to-r from-pink-500 to-rose-500 text-white py-3 rounded-xl font-medium hover:from-pink-600 hover:to-rose-600 transition-all disabled:opacity-70 flex items-center justify-center gap-2"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mail className="w-4 h-4" />}
                {loading ? "Enviando..." : "Enviar link de recuperação"}
              </button>
            </form>
          )}

          {/* ── Tela de Confirmação ── */}
          {screen === "forgot-sent" && (
            <div className="text-center py-4 space-y-4">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
                <CheckCircle className="w-8 h-8 text-emerald-500" />
              </div>
              <div>
                <p className="font-semibold text-gray-900">E-mail enviado!</p>
                <p className="text-sm text-gray-500 mt-1">
                  Se <span className="font-medium text-gray-700">{forgotEmail}</span> estiver cadastrado,
                  você receberá um link para redefinir sua senha em breve.
                </p>
              </div>
              <p className="text-xs text-gray-400">Não recebeu? Verifique sua caixa de spam.</p>
              <button
                type="button"
                onClick={() => goTo("login")}
                className="w-full border border-pink-300 text-pink-600 py-2.5 rounded-xl text-sm font-medium hover:bg-pink-50 transition-colors"
              >
                Voltar ao login
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
