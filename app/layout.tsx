import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Soundboard",
  description: "Click pads to play sounds",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${geistSans.variable} h-full antialiased theme-dark`}>
      {/* Restore saved theme before first paint to avoid flash */}
      <script dangerouslySetInnerHTML={{ __html: `
        (function(){
          var t = localStorage.getItem('theme') || 'dark';
          document.documentElement.className = document.documentElement.className
            .replace(/\\btheme-\\S+/g, '') + ' theme-' + t;
        })();
      ` }} />
      <body className="min-h-full flex flex-col">
        {children}
      </body>
    </html>
  );
}
