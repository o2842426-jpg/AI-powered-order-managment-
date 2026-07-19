import { useEffect } from "react";
import { PRODUCT_NAME } from "../lib/brand";
import { LandingNav } from "./landing/Nav";
import { Manifesto } from "./landing/Manifesto";
import { LivingStore } from "./landing/LivingStore";
import { InteractiveDemo } from "./landing/InteractiveDemo";
import { RoiCalculator } from "./landing/RoiCalculator";
import { Faq } from "./landing/Faq";
import { Features, FinalCta, Footer, HowItWorks, WhyShopIQ } from "./landing/Sections";
import "./landing/landing.css";

function scrollToId(id) {
  if (typeof document === "undefined") return;
  if (id === "top") {
    window.scrollTo({ top: 0, behavior: "smooth" });
    return;
  }
  const el = document.getElementById(id);
  if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
}

export function LandingPage({ onStartTrial, onLogin }) {
  useEffect(() => {
    const prev = document.title;
    document.title = `${PRODUCT_NAME} — التجارة الحيّة`;
    return () => {
      document.title = prev;
    };
  }, []);

  const startTrial = () => (onStartTrial ? onStartTrial() : undefined);
  const login = () => (onLogin ? onLogin() : undefined);

  return (
    <div className="lp" dir="rtl">
      <div className="lp__bg" aria-hidden="true">
        <div className="lp__orb lp__orb--1" />
        <div className="lp__orb lp__orb--2" />
      </div>

      <LandingNav onScrollTo={scrollToId} onStartTrial={startTrial} onLogin={login} />

      <Manifesto onStartTrial={startTrial} onScrollTo={scrollToId} />
      <LivingStore />
      <WhyShopIQ />
      <HowItWorks />
      <InteractiveDemo />
      <RoiCalculator />
      <Features />
      <Faq />
      <FinalCta onStartTrial={startTrial} />
      <Footer onScrollTo={scrollToId} />
    </div>
  );
}
