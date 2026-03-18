import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "My Drops | Token Claimer",
};

export default function MyDropsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
