import { NextRequest, NextResponse } from "next/server";

const CLIENT_ID     = process.env.ML_CLIENT_ID     ?? "1664631224999083";
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? "Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG";
const REDIRECT_URI  = "https://coscorebr.com.br/api/ml-callback";

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");

  if (!code) {
    return NextResponse.json({ error: "Código de autorização não recebido." }, { status: 400 });
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
      return NextResponse.json({ error: "Falha ao obter token.", detail: data }, { status: 400 });
    }

    // Retorna os tokens para serem copiados para as variáveis de ambiente do Vercel
    return NextResponse.json({
      ok: true,
      message: "✅ Tokens obtidos! Copie os valores abaixo para as variáveis de ambiente do Vercel.",
      ML_ACCESS_TOKEN:  data.access_token,
      ML_REFRESH_TOKEN: data.refresh_token,
      expires_in:       data.expires_in,
      instructions: [
        "1. Acesse https://vercel.com → seu projeto → Settings → Environment Variables",
        "2. Atualize (ou crie) ML_ACCESS_TOKEN com o valor de access_token acima",
        "3. Crie ML_REFRESH_TOKEN com o valor de refresh_token acima",
        "4. Faça um novo deploy para aplicar",
      ],
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
