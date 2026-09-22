import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Gemini API Playground",
  description: "Secure server-side Gemini API playground for Vercel",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
