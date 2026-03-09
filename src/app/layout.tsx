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
      </body>
    </html>
  );
}
