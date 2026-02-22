import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Header from "./components/Header";
import WalletProvider from "./components/WalletProvider";
import NetworkProvider from "./components/NetworkProvider";
import TestnetBanner from "./components/TestnetBanner";
import { Analytics } from "@vercel/analytics/next";

const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
  themeColor: "#0a0a0f",
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
    <html lang="en">
      <body className={`${inter.className} antialiased`}>
        <NetworkProvider>
          <WalletProvider>
            <Header />
            <TestnetBanner />
            {children}
          </WalletProvider>
        </NetworkProvider>
        <Analytics />
      </body>
    </html>
  );
}
