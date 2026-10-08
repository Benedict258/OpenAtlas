import Link from "next/link";
import Nav from "@/components/Nav";
import StatusDot from "@/components/StatusDot";

export const FOOTER_LINE = "Demo of the OpenAtlas SDK. N-ATLaS is for non-commercial use.";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const mock = process.env.DEMO_MOCK === "1";

  return (
    <>
      <header className="topbar">
        <Link href="/chat" className="brand">
          Open<span className="brand-mark">Atlas</span>
        </Link>
        <Nav />
        <StatusDot />
      </header>
      {mock && (
        <div className="mock-banner" role="status">
          MOCK MODE — canned responses only. Never record or deploy with this on.
        </div>
      )}
      <main className="main">{children}</main>
      <footer className="foot">{FOOTER_LINE}</footer>
    </>
  );
}
