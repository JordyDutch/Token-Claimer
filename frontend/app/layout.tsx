import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import WalletProvider from "./components/WalletProvider";
import NetworkProvider from "./components/NetworkProvider";
import ThemeProvider from "./components/ThemeProvider";
import UPProviderInit from "./components/UPProviderInit";
import IframeShell from "./components/IframeShell";
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
    url: "https://agent-token-claimer.vercel.app",
    images: [{ url: "https://agent-token-claimer.vercel.app/og.png", width: 1200, height: 630 }],
  },
  twitter: {
    card: "summary_large_image",
    site: "@LUKSOAgent",
    creator: "@LUKSOAgent",
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
          <UPProviderInit>
            <NetworkProvider>
              <WalletProvider>
                <IframeShell>
                  {children}
                </IframeShell>
              </WalletProvider>
            </NetworkProvider>
          </UPProviderInit>
        </ThemeProvider>
        <Analytics />
      </body>
    </html>
  );
}
