import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Heirloom Audio",
  description: "Record, produce, and share audiobooks with the people you love.",
  icons: {
    icon: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body className="noise-overlay vignette min-h-screen antialiased" suppressHydrationWarning>
        {children}
        <div className="fixed bottom-4 right-4 z-50 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full shadow-lg pointer-events-none select-none tracking-widest uppercase">
          Beta
        </div>
      </body>
    </html>
  );
}
