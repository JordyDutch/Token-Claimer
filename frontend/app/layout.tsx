import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Claim Your NFT",
  description: "Claim your exclusive NFT drop on LUKSO",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
