import { Geist_Mono } from "next/font/google";
import { GeistSans } from "geist/font/sans";
import { defaultLocale } from "@atmos/i18n/config";
import { THEME_INIT_SCRIPT } from "@/lib/theme";
import "./globals.css";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={defaultLocale} suppressHydrationWarning>
      <head>
        {/*
          Lives in the root layout so locale switches do not re-render this
          <script> on the client (React 19 rejects that).
        */}
        <script
          id="theme-init"
          dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }}
        />
      </head>
      <body
        className={`${GeistSans.variable} ${geistMono.variable} ${GeistSans.className} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
