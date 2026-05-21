import { motion, useReducedMotion } from "framer-motion";
import "./OwnerMetricCard.css";

const GLOW_RGB = {
  emerald: "16, 185, 129",
  cyan: "34, 211, 238",
  indigo: "99, 102, 241",
  amber: "245, 158, 11",
};

/**
 * Premium metric surface with optional hover glow (respects prefers-reduced-motion).
 * @param {"emerald"|"cyan"|"indigo"|"amber"} glow
 */
export function OwnerMetricCard({
  glow = "emerald",
  className = "",
  children,
  wide = false,
  attention = false,
  inventory = false,
}) {
  const reduceMotion = useReducedMotion();
  const rgb = GLOW_RGB[glow] ?? GLOW_RGB.emerald;

  const classes = [
    "owner-metric-card",
    wide ? "owner-metric-card--wide" : "",
    attention ? "owner-metric-card--attention" : "",
    inventory ? "owner-metric-card--inventory" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  if (reduceMotion) {
    return (
      <article
        className={classes}
        data-glow={glow}
        style={{ "--metric-glow-rgb": rgb }}
      >
        {children}
      </article>
    );
  }

  return (
    <motion.article
      className={classes}
      data-glow={glow}
      style={{ "--metric-glow-rgb": rgb }}
      initial={false}
      whileHover="hover"
    >
      <motion.span
        className="owner-metric-card__glow"
        aria-hidden
        variants={{
          hover: { opacity: 1 },
        }}
        initial={{ opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      />
      {children}
    </motion.article>
  );
}
