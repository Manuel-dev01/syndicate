import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Syndicate",
  description:
    "Confidential syndicated-lending operating system on the Canton Network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="font-mono">{children}</body>
    </html>
  );
}
