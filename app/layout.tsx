import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Núcleo Contábil",
  description: "Painel do escritório — módulos e aplicações da contabilidade",
  icons: {
    icon: "/phd-favicon.png",
    shortcut: "/phd-favicon.png",
    apple: "/phd-favicon.png",
  },
};

const themeInit = `(function(){try{var t=localStorage.getItem('nc-tema');if(t==='dark'||t==='light'){document.documentElement.dataset.theme=t;}}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInit }} />
      </head>
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
