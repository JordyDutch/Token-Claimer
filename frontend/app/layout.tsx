import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import WalletProvider from "./components/WalletProvider";
import NetworkProvider from "./components/NetworkProvider";
import TestnetBanner from "./components/TestnetBanner";
import ThemeProvider from "./components/ThemeProvider";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#f8fafb",
};

export const metadata: Metadata = {
  title: "Token Claimer | LUKSO",
  description: "Claim exclusive token drops on LUKSO",
  openGraph: {
    title: "Token Claimer | LUKSO",
    description: "Claim exclusive token drops on LUKSO",
    type: "website",
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
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem("theme");if(t==="dark")document.documentElement.classList.add("dark")}catch(e){}})()`,
          }}
        />
      </head>
      <body className={`${inter.className} antialiased`}>
        <ThemeProvider>
          <NetworkProvider>
            <WalletProvider>
              <Header />
              <TestnetBanner />
              {children}
            </WalletProvider>
          </NetworkProvider>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
