import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID     = process.env.ML_CLIENT_ID     ?? "1664631224999083";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? "Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG";
const REDIRECT_URI  = "https://coscorebr.com.br/api/ml-callback";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return new NextResponse(
      `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>ML Callback</title>
      <style>body{font-family:sans-serif;padding:2rem;color:#333}h1{color:#e53}</style>
      </head><body><h1>Erro</h1><p>Código de autorização não recebido.</p></body></html>`,
      { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  try {
    const body = new URLSearchParams({
      grant_type:    "authorization_code",
      client_id:     CLIENT_ID,
      client_secret: CLIENT_SECRET,
      code,
      redirect_uri:  REDIRECT_URI,
    });

    const res  = await fetch("https://api.mercadolibre.com/oauth/token", {
      method:  "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body:    body.toString(),
    });

    const data = await res.json();

    if (!data.access_token) {
      const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"><title>Erro ML</title>
        <style>body{font-family:sans-serif;padding:2rem;color:#333}pre{background:#f5f5f5;padding:1rem;border-radius:8px;overflow:auto}</style>
        </head><body><h1>Erro ao obter token</h1><pre>${JSON.stringify(data, null, 2)}</pre></body></html>`;
      return new NextResponse(html, { status: 400, headers: { "Content-Type": "text/html; charset=utf-8" } });
    }

    const accessToken  = data.access_token as string;
    const refreshToken = (data.refresh_token ?? "") as string;
    const expiresIn    = data.expires_in ?? 21600;

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Tokens ML obtidos</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8fafc; color: #1e293b; padding: 1.5rem; }
    .card { max-width: 680px; margin: 2rem auto; background: white; border-radius: 16px; box-shadow: 0 4px 24px rgba(0,0,0,.08); overflow: hidden; }
    .header { background: linear-gradient(135deg, #10b981, #059669); padding: 1.5rem 2rem; color: white; }
    .header h1 { font-size: 1.4rem; font-weight: 700; }
    .header p { font-size: .9rem; opacity: .85; margin-top: .4rem; }
    .body { padding: 2rem; }
    .token-block { margin-bottom: 1.5rem; }
    .token-block label { font-size: .75rem; font-weight: 700; color: #64748b; text-transform: uppercase; letter-spacing: .05em; display: block; margin-bottom: .5rem; }
    .token-box { display: flex; align-items: center; gap: .5rem; }
    .token-box input { flex: 1; font-family: monospace; font-size: .8rem; background: #f1f5f9; border: 1px solid #e2e8f0; border-radius: 8px; padding: .6rem .75rem; color: #1e293b; }
    .copy-btn { background: #10b981; color: white; border: none; border-radius: 8px; padding: .6rem .9rem; font-size: .8rem; font-weight: 600; cursor: pointer; white-space: nowrap; }
    .copy-btn:hover { background: #059669; }
    .copy-btn.copied { background: #6366f1; }
    .steps { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 1.25rem 1.5rem; }
    .steps h3 { font-size: .9rem; font-weight: 700; margin-bottom: 1rem; color: #334155; }
    .step { display: flex; gap: .75rem; margin-bottom: .75rem; align-items: flex-start; }
    .step-num { background: #10b981; color: white; width: 22px; height: 22px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: .7rem; font-weight: 700; flex-shrink: 0; }
    .step p { font-size: .85rem; color: #475569; line-height: 1.5; }
    .step a { color: #10b981; font-weight: 600; }
    .warning { background: #fef9c3; border: 1px solid #fde047; border-radius: 8px; padding: .75rem 1rem; font-size: .82rem; color: #854d0e; margin-top: 1.25rem; }
    .expiry { font-size: .8rem; color: #94a3b8; margin-top: .4rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Tokens do Mercado Livre obtidos!</h1>
      <p>Copie os dois valores abaixo e adicione nas variáveis de ambiente do Vercel.</p>
    </div>
    <div class="body">
      <div class="token-block">
        <label>ML_ACCESS_TOKEN (expira em ~${Math.round(expiresIn / 3600)}h)</label>
        <div class="token-box">
          <input type="text" id="access" readonly value="${accessToken}" />
          <button class="copy-btn" onclick="copyVal('access', this)">Copiar</button>
        </div>
        <p class="expiry">Válido por ${expiresIn} segundos a partir de agora</p>
      </div>

      ${refreshToken ? `
      <div class="token-block">
        <label>ML_REFRESH_TOKEN (permanente — necessário para renovação automática)</label>
        <div class="token-box">
          <input type="text" id="refresh" readonly value="${refreshToken}" />
          <button class="copy-btn" onclick="copyVal('refresh', this)">Copiar</button>
        </div>
      </div>` : `<div class="warning">Refresh token não recebido — pode ser necessário re-autorizar periodicamente.</div>`}

      <div class="steps">
        <h3>Como aplicar no Vercel</h3>
        <div class="step">
          <div class="step-num">1</div>
          <p>Acesse <a href="https://vercel.com" target="_blank">vercel.com</a> → seu projeto CoScore → <strong>Settings → Environment Variables</strong></p>
        </div>
        <div class="step">
          <div class="step-num">2</div>
          <p>Encontre (ou crie) a variável <strong>ML_ACCESS_TOKEN</strong> e atualize com o valor copiado acima.</p>
        </div>
        ${refreshToken ? `<div class="step">
          <div class="step-num">3</div>
          <p>Crie (se não existir) a variável <strong>ML_REFRESH_TOKEN</strong> com o refresh token copiado.</p>
        </div>` : ""}
        <div class="step">
          <div class="step-num">${refreshToken ? "4" : "3"}</div>
          <p>Clique em <strong>Save</strong> e depois vá em <strong>Deployments → Redeploy</strong> para aplicar.</p>
        </div>
      </div>

      <div class="warning">
        Este código de autorização so pode ser usado uma vez. Guarde o <strong>ML_REFRESH_TOKEN</strong> — ele renova o acesso automaticamente sem precisar re-autorizar.
      </div>
    </div>
  </div>

  <script>
    function copyVal(id, btn) {
      const el = document.getElementById(id);
      navigator.clipboard.writeText(el.value).then(() => {
        const orig = btn.textContent;
        btn.textContent = "Copiado!";
        btn.classList.add("copied");
        setTimeout(() => { btn.textContent = orig; btn.classList.remove("copied"); }, 2000);
      });
    }
  </script>
</body>
</html>`;

    return new NextResponse(html, {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    });
  } catch (err) {
    return new NextResponse(
      `<!DOCTYPE html><html><body><h1>Erro interno</h1><pre>${String(err)}</pre></body></html>`,
      { status: 500, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }
}
