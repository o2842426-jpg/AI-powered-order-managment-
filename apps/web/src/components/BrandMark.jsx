import {
  PRODUCT_LOGO_URL,
  PRODUCT_NAME,
  PRODUCT_TAGLINE_AR,
} from "../lib/brand";
import "./BrandMark.css";

/**
 * Logo + product name (sidebar, login, etc.)
 * @param {"sm"|"md"} size
 * @param {boolean} showTagline
 */
export function BrandMark({ size = "md", showTagline = true, className = "" }) {
  const classes = ["brand-mark", `brand-mark--${size}`, className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      <img
        className="brand-mark__logo"
        src={PRODUCT_LOGO_URL}
        alt=""
        width={size === "sm" ? 36 : 44}
        height={size === "sm" ? 36 : 44}
        decoding="async"
      />
      <div className="brand-mark__text">
        <strong>{PRODUCT_NAME}</strong>
        {showTagline ? <span>{PRODUCT_TAGLINE_AR}</span> : null}
      </div>
    </div>
  );
}
