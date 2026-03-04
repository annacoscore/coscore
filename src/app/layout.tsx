import type { Metadata } from "next";
import { Geist, Geist_Mono, Poppins } from "next/font/google";
import "./globals.css";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import LoginModal from "@/components/LoginModal";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://coscorebr.com.br"),
  title: "CoScore – Reviews de Cosméticos & Comparação de Preços",
  description:
    "Encontre reviews honestas de cosméticos e compare preços nas melhores lojas. Descubra os produtos certos para você no CoScore.",
  icons: {
    icon: "/favicon.png",
    apple: "/favicon.png",
    shortcut: "/favicon.png",
  },
  openGraph: {
    title: "CoScore – Reviews de Cosméticos & Comparação de Preços",
    description:
      "Encontre reviews honestas de cosméticos e compare preços nas melhores lojas. Descubra os produtos certos para você no CoScore.",
    url: "https://coscorebr.com.br",
    siteName: "CoScore",
    images: [
      {
        url: "/og-image.png",
        width: 1024,
        height: 1024,
        alt: "CoScore – Reviews de Cosméticos",
      },
    ],
    locale: "pt_BR",
    type: "website",
  },
  twitter: {
    card: "summary",
    title: "CoScore – Reviews de Cosméticos & Comparação de Preços",
    description:
      "Reviews honestas de cosméticos e comparação de preços nas melhores lojas brasileiras.",
    images: ["/og-image.png"],
  },
  other: {
    "verify-admitad": "d6c3d36c3a",
    "lomadee": "2324685",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className={`${geistSans.variable} ${geistMono.variable} ${poppins.variable} antialiased`}>
        <Header />
        <main className="min-h-screen">{children}</main>
        <Footer />
        <LoginModal />
      </body>
    </html>
  );
}
