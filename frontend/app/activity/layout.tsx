import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Activity | Token Claimer",
};

export default function ActivityLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
