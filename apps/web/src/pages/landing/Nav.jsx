import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { PRODUCT_LOGO_URL, PRODUCT_NAME } from "../../lib/brand";

const NAV_LINKS = [
  { id: "features", label: "الميزات" },
  { id: "how", label: "كيف يعمل" },
  { id: "pricing", label: "الأسعار" },
  { id: "faq", label: "الأسئلة الشائعة" },
  { id: "resources", label: "الموارد" },
];

export function AnnouncementBar({ onLearnMore }) {
  return (
    <div className="lp-announce" role="region" aria-label="إعلان">
      <span className="lp-announce__text">
        ◆ نُعيد تعريف المتجر الإلكتروني — تعرّف على «التجارة الحيّة».
      </span>
      <button type="button" className="lp-announce__btn" onClick={onLearnMore}>
        شاهده يستيقظ →
      </button>
    </div>
  );
}

export function LandingNav({ onScrollTo, onStartTrial, onLogin }) {
  const [stuck, setStuck] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setStuck(window.scrollY > 12);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const go = (id) => (event) => {
    event.preventDefault();
    setMenuOpen(false);
    onScrollTo(id);
  };

  return (
    <header className={`lp-nav${stuck ? " is-stuck" : ""}`}>
      <div className="lp-nav__inner">
        <a className="lp-brand" href="#top" onClick={go("top")}>
          <img className="lp-brand__logo" src={PRODUCT_LOGO_URL} alt={PRODUCT_NAME} />
          <span className="lp-brand__name">{PRODUCT_NAME}</span>
        </a>

        <nav className="lp-nav__links" aria-label="روابط التنقل">
          {NAV_LINKS.map((link) => (
            <a key={link.id} href={`#${link.id}`} onClick={go(link.id)}>
              {link.label}
            </a>
          ))}
        </nav>

        <div className="lp-nav__actions">
          <button type="button" className="lp-btn lp-btn--ghost" onClick={onLogin}>
            تسجيل الدخول
          </button>
          <button type="button" className="lp-btn lp-btn--gradient" onClick={onStartTrial}>
            أيقظ متجرك
          </button>
          <button
            type="button"
            className="lp-nav__burger"
            aria-label="القائمة"
            aria-expanded={menuOpen}
            onClick={() => setMenuOpen((v) => !v)}
          >
            {menuOpen ? "✕" : "☰"}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {menuOpen && (
          <motion.nav
            className="lp-nav__mobile"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.25 }}
            aria-label="قائمة الجوال"
            style={{
              overflow: "hidden",
              borderTop: "1px solid rgba(255,255,255,0.08)",
              background: "rgba(11,15,25,0.95)",
              backdropFilter: "blur(18px)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", padding: "0.8rem 1.5rem 1.2rem", gap: "0.4rem" }}>
              {NAV_LINKS.map((link) => (
                <a
                  key={link.id}
                  href={`#${link.id}`}
                  onClick={go(link.id)}
                  style={{ color: "#94a3b8", textDecoration: "none", fontWeight: 600, padding: "0.6rem 0" }}
                >
                  {link.label}
                </a>
              ))}
              <button
                type="button"
                className="lp-btn lp-btn--ghost lp-btn--full"
                style={{ marginTop: "0.5rem" }}
                onClick={() => {
                  setMenuOpen(false);
                  onLogin();
                }}
              >
                تسجيل الدخول
              </button>
            </div>
          </motion.nav>
        )}
      </AnimatePresence>
    </header>
  );
}
