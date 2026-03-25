import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Sidebar } from "@/components/layout/sidebar";
import { Providers } from "@/components/providers";
import { Notifications } from "@/components/notifications";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "Orchestra",
  description: "Agentic Coding Workflow Platform",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            var saved = localStorage.getItem('orchestra-theme');
            var prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            if (saved === 'dark' || (!saved && prefersDark)) {
              document.documentElement.classList.add('dark');
            }
          })();
        `}} />
      </head>
      <body className={`${inter.variable} font-sans antialiased`}>
        <Providers>
          <div className="flex h-screen overflow-hidden">
            <Sidebar />
            <main className="flex-1 overflow-y-auto bg-[var(--background)]">
              {children}
            </main>
          </div>
          <Notifications />
        </Providers>
      </body>
    </html>
  );
}
