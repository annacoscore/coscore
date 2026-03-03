/**
 * CoScore — Autenticação Mercado Livre
 *
 * Gera o link de autorização OAuth e troca o código pelo access token.
 * Execute: npx tsx scripts/ml-auth.ts
 */

import * as readline from 'readline';
import * as fs from 'fs';
import * as path from 'path';

const CLIENT_ID     = process.env.ML_CLIENT_ID     ?? '1664631224999083';
const CLIENT_SECRET = process.env.ML_CLIENT_SECRET ?? 'Cm5TOTjcKyf2tuubJr9kqPFO49zY0LGG';
const REDIRECT_URI  = 'https://coscorebr.com.br/';

const authUrl =
  `https://auth.mercadolivre.com.br/authorization` +
  `?response_type=code` +
  `&client_id=${CLIENT_ID}` +
  `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}`;

console.log('\n╔══════════════════════════════════════════════════════════════╗');
console.log('║   CoScore — Autenticação Mercado Livre                       ║');
console.log('╚══════════════════════════════════════════════════════════════╝\n');
console.log('PASSO 1: Abra este link no navegador:\n');
console.log('  ' + authUrl + '\n');
console.log('PASSO 2: Faça login com sua conta do Mercado Livre e autorize o app.');
console.log('PASSO 3: Você será redirecionado para coscorebr.com.br (pode dar erro de site,');
console.log('         mas o que importa é o endereço na barra do navegador).');
console.log('PASSO 4: Copie APENAS o código que aparece após "?code=" na URL.');
console.log('         Exemplo: https://coscorebr.com.br?code=TG-abc123...');
console.log('         → copie apenas: TG-abc123...\n');

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

rl.question('Cole o código aqui e pressione Enter: ', async (code) => {
  rl.close();
  code = code.trim();

  if (!code) {
    console.error('\n✗ Nenhum código informado. Tente novamente.');
    process.exit(1);
  }

  console.log('\n⏳ Trocando código por access token...');

  try {
    const res = await fetch('https://api.mercadolibre.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' },
      body: new URLSearchParams({
        grant_type:    'authorization_code',
        client_id:     CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri:  REDIRECT_URI,
      }),
    });

    const data = await res.json() as Record<string, unknown>;

    if (!res.ok) {
      console.error('\n✗ Erro ao obter token:');
      console.error(JSON.stringify(data, null, 2));
      process.exit(1);
    }

    const accessToken  = data.access_token as string;
    const refreshToken = data.refresh_token as string;
    const expiresIn    = data.expires_in as number;

    console.log('\n✅ Token obtido com sucesso!');
    console.log(`   Expira em: ${Math.round(expiresIn / 3600)} horas\n`);

    // Atualiza o .env.local
    const envPath = path.resolve(process.cwd(), '.env.local');
    let envContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf-8') : '';

    // Remove linhas antigas de token
    envContent = envContent
      .split('\n')
      .filter(l => !l.startsWith('ML_ACCESS_TOKEN=') && !l.startsWith('ML_REFRESH_TOKEN='))
      .join('\n')
      .trimEnd();

    envContent += `\nML_ACCESS_TOKEN=${accessToken}`;
    if (refreshToken) envContent += `\nML_REFRESH_TOKEN=${refreshToken}`;
    envContent += '\n';

    fs.writeFileSync(envPath, envContent, 'utf-8');
    console.log('✅ .env.local atualizado com o novo token!\n');
    console.log('Agora rode o sync:');
    console.log('  npm run sync-catalog\n');

  } catch (err) {
    console.error('\n✗ Erro:', err);
    process.exit(1);
  }
});
