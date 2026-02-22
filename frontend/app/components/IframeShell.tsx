"use client";

import { ReactNode } from "react";
import Header from "./Header";
import TestnetBanner from "./TestnetBanner";
import { useUPProvider } from "./UPProviderInit";

export default function IframeShell({ children }: { children: ReactNode }) {
  const { inIframe } = useUPProvider();

  if (inIframe) {
    return <>{children}</>;
  }

  return (
    <>
      <Header />
      <TestnetBanner />
      {children}
    </>
  );
}
