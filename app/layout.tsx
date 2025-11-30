import "./globals.css";
import { AppLayout } from "@/components/layout/AppLayout";
import { AuthProvider } from "@/lib/auth/auth-context";

export const metadata = {
  title: "Daily Sales Management",
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
