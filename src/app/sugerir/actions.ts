"use server";

import nodemailer from "nodemailer";

export interface SugestaoState {
  success: boolean;
  message: string;
}

export async function enviarSugestao(
  _prev: SugestaoState,
  formData: FormData,
): Promise<SugestaoState> {
  const produto = (formData.get("produto") as string | null)?.trim() ?? "";
  const marca = (formData.get("marca") as string | null)?.trim() ?? "";
  const categoria = (formData.get("categoria") as string | null)?.trim() ?? "";
  const emailUsuario = (formData.get("emailUsuario") as string | null)?.trim() ?? "";
  const observacao = (formData.get("observacao") as string | null)?.trim() ?? "";

  if (!produto) {
    return { success: false, message: "Por favor, informe o nome do produto." };
  }

  const gmailUser = process.env.GMAIL_USER;
  const gmailPass = process.env.GMAIL_APP_PASSWORD;

  if (!gmailUser || !gmailPass) {
    console.error("Credenciais de email não configuradas em .env.local");
    return {
      success: false,
      message: "Serviço de email não configurado. Tente novamente mais tarde.",
    };
  }

  const transporter = nodemailer.createTransport({
    host: "smtp.gmail.com",
    port: 465,
    secure: true,
    auth: { user: gmailUser, pass: gmailPass },
  });

  const linhas = [
    `🛍️  <b>Produto sugerido:</b> ${produto}`,
    marca ? `🏷️  <b>Marca:</b> ${marca}` : null,
    categoria ? `📂  <b>Categoria:</b> ${categoria}` : null,
    emailUsuario ? `📧  <b>Email do usuário:</b> ${emailUsuario}` : null,
    observacao ? `💬  <b>Observação:</b> ${observacao}` : null,
    ``,
    `<small>Enviado em ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} via CoScore</small>`,
  ]
    .filter((l) => l !== null)
    .join("<br>");

  try {
    await transporter.sendMail({
      from: `"CoScore — Sugestões" <${gmailUser}>`,
      to: "anna.coscore@gmail.com",
      subject: `[CoScore] Sugestão de produto: ${produto}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;padding:24px;border:1px solid #e5b9d3;border-radius:12px;background:#fdf8f6">
          <h2 style="color:#6b3a5c;margin:0 0 16px">Nova sugestão de produto</h2>
          <p style="color:#333;line-height:1.7">${linhas}</p>
        </div>
      `,
    });

    return { success: true, message: "Sugestão enviada! Obrigada pelo feedback 💜" };
  } catch (err) {
    console.error("Erro ao enviar email:", err);
    return {
      success: false,
      message: "Não foi possível enviar. Tente novamente em alguns instantes.",
    };
  }
}
