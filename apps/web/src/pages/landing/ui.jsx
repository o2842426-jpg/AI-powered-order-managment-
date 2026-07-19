import { motion } from "framer-motion";

/* Shared motion variants (respect reduced-motion via CSS + Framer's own detection) */
export const fadeUp = {
  hidden: { opacity: 0, y: 26 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export const fadeIn = {
  hidden: { opacity: 0 },
  show: { opacity: 1, transition: { duration: 0.6, ease: [0.22, 1, 0.36, 1] } },
};

export const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};

export const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  show: { opacity: 1, scale: 1, transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] } },
};

const viewport = { once: true, margin: "-80px" };

/** Scroll-reveal wrapper. */
export function Reveal({ children, className, variants = fadeUp, as = "div", ...rest }) {
  const M = motion[as] || motion.div;
  return (
    <M
      className={className}
      variants={variants}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      {...rest}
    >
      {children}
    </M>
  );
}

/** Staggered container — children should use `item` / fadeUp variants. */
export function RevealGroup({ children, className, as = "div", ...rest }) {
  const M = motion[as] || motion.div;
  return (
    <M
      className={className}
      variants={stagger}
      initial="hidden"
      whileInView="show"
      viewport={viewport}
      {...rest}
    >
      {children}
    </M>
  );
}

/** Section header (eyebrow + title + lead). */
export function SectionHead({ eyebrow, title, lead, id }) {
  return (
    <Reveal className="lp-head" id={id}>
      {eyebrow ? <span className="lp-eyebrow">{eyebrow}</span> : null}
      <h2 className="lp-title">{title}</h2>
      {lead ? <p className="lp-lead">{lead}</p> : null}
    </Reveal>
  );
}
