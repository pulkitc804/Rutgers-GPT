import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const fontSans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Rutgers GPT",
  description: "Rutgers GPT — campus chat, live transit, dining, and classes",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <body className={`min-h-screen bg-background font-sans ${fontSans.variable}`}>{children}</body>
    </html>
  );
}
