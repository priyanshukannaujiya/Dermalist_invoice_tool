import type { Metadata } from "next";
import { Inter, Outfit } from "next/font/google";
import "./globals.css";
import { Toaster } from "sonner";
import { Navigation } from "@/components/Navigation";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "AI Invoice Studio — Dermalist Smart Non-GST Generator",
  description:
    "Enterprise-ready AI non-GST invoice generator for Dermalist (B M M Retail Private Limited) influencer billing.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${inter.variable} ${outfit.variable}`}>
      <body className="antialiased bg-slate-50 text-slate-900 min-h-screen flex flex-col font-sans">
        <Navigation />
        <main className="flex-1 flex flex-col">{children}</main>
        <footer className="border-t border-slate-200 bg-white py-4 px-6 text-center text-xs text-slate-500">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row justify-between items-center gap-2">
            <span>
              <strong>Dermalist</strong> &bull; B M M RETAIL PRIVATE LIMITED &bull; Non-GST Invoice Studio
            </span>
            <span className="text-slate-400">
              Powered by Next.js 15, Neon PostgreSQL & Groq Cloud AI
            </span>
          </div>
        </footer>
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
