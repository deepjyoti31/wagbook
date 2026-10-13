import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Wagbook", template: "%s | Wagbook" },
  description: "Open source software for running a pet boarding kennel: bookings, kennels, daily care, WhatsApp updates and bills.",
  applicationName: "Wagbook",
  appleWebApp: { capable: true, title: "Wagbook", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: "#14213d",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
