import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Noor · Coffee field notebook",
  description: "Offline crop observations and coffee market estimates.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
