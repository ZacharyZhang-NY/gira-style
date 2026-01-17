import type { Metadata } from "next";
import { Inter, Jost, Playfair_Display } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/features/theme/theme";

const display = Playfair_Display({
  subsets: ["latin"],
  variable: "--font-display",
  display: "swap",
});

const sans = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  display: "swap",
});

const jost = Jost({
  subsets: ["latin"],
  variable: "--font-jost",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "GiraStyle",
    template: "%s · GiraStyle",
  },
  description:
    "A warm styling concierge with a luxury retail eye—curated, shoppable looks you can refine in seconds.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="scroll-smooth" data-theme="light" suppressHydrationWarning>
      <body className={`${display.variable} ${sans.variable} ${jost.variable} font-sans`}>
        <ThemeProvider>{children}</ThemeProvider>
      </body>
    </html>
  );
}
