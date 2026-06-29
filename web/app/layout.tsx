import type { Metadata } from "next";
import { Space_Mono } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";

// Space Mono is the data/label face throughout the comps; exposed as a CSS var for Tailwind.
const spaceMono = Space_Mono({
  weight: ["400", "700"],
  subsets: ["latin"],
  variable: "--font-space-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Syndicate — Confidential syndicated lending on Canton",
  description:
    "Multiple competing lenders, one shared facility, each sees only its own slice — and every cash-vs-position move settles atomically on the Canton Network.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={spaceMono.variable}>
      <body className="font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
