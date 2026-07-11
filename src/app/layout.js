
import "./globals.css";

export const metadata = {
  title: "Criticpick Solutions  Billing Portal",
  description: "FBR IMS/POS Compliant Live Invoicing Engine",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="antialiased">
        {children}
      </body>
    </html>
  );
}