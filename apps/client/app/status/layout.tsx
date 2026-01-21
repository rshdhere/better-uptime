import React from "react";
import { TRPCProvider } from "../providers";

export default function StatusLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <TRPCProvider>{children}</TRPCProvider>;
}
