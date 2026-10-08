import type { Metadata } from "next";
import UnlockForm from "@/components/UnlockForm";
import { FOOTER_LINE } from "@/app/(app)/layout";

export const metadata: Metadata = { title: "Unlock" };

export default function UnlockPage() {
  return (
    <>
      <div className="unlock-wrap">
        <div className="unlock-card fade-in">
          <div className="brand" style={{ fontSize: 22 }}>
            Open<span className="brand-mark">Atlas</span>
          </div>
          <h1>Welcome</h1>
          <p className="sub">
            Enter the demo passcode to use the OpenAtlas SDK demo against N-ATLaS.
          </p>
          <UnlockForm />
        </div>
      </div>
      <footer className="foot">{FOOTER_LINE}</footer>
    </>
  );
}
