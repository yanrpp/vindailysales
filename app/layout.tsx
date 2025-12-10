import "./globals.css";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/lib/auth/auth-context";

export const metadata = {
  title: "Drug Management",
  icons: {
    icon: "/img/vin.png",
    shortcut: "/img/vin.png",
    apple: "/img/vin.png",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <AuthProvider>
          <AppLayout>{children}</AppLayout>
        </AuthProvider>
      </body>
    </html>
  );
}
