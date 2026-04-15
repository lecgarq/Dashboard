import type { Metadata } from "next";
import { Manrope, Space_Grotesk } from "next/font/google";
import "./globals.css";
import { TRPCProvider } from "@/lib/providers";

const manrope = Manrope({
  subsets: ["latin"],
  variable: "--font-manrope",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

export const metadata: Metadata = {
  title: "BIM Dashboard",
  description: "ACC-aligned BIM project management dashboard",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${manrope.variable} ${spaceGrotesk.variable} font-sans antialiased`}
        suppressHydrationWarning
      >
        <TRPCProvider>
          {children}
        </TRPCProvider>
      </body>
    </html>
  );
}
