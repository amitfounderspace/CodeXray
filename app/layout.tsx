import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "CodeXray",
  description:
    "Independent developer tool — live code architecture map + telemetry heat view.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
