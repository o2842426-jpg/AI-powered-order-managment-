import { useEffect, useMemo, useRef, useState } from "react";
import { animate } from "framer-motion";
import { SectionHead, Reveal } from "./ui";

function useCountUp(value) {
  const [display, setDisplay] = useState(value);
  const prev = useRef(value);
  useEffect(() => {
    const controls = animate(prev.current, value, {
      duration: 0.7,
      ease: "easeOut",
      onUpdate: (v) => setDisplay(v),
    });
    prev.current = value;
    return () => controls.stop();
  }, [value]);
  return display;
}

const fmt = (n) => Math.round(n).toLocaleString("en-US");

function NumberField({ id, label, unit, value, min, max, step = 1, onChange }) {
  return (
    <div className="lp-field">
      <label htmlFor={id}>{label}</label>
      <div className="lp-field__row">
        <input
          id={id}
          type="number"
          inputMode="numeric"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
        />
        {unit ? <span className="lp-field__unit">{unit}</span> : null}
      </div>
    </div>
  );
}

export function RoiCalculator() {
  const [visitors, setVisitors] = useState(5000);
  const [conversations, setConversations] = useState(800);
  const [convRate, setConvRate] = useState(15);
  const [aov, setAov] = useState(45000);
  const [uplift, setUplift] = useState(30);

  const { currentOrders, currentRevenue, additional, startRate } = useMemo(() => {
    const conv = Math.max(0, conversations);
    const orders = conv * (Math.max(0, convRate) / 100);
    const revenue = orders * Math.max(0, aov);
    const extra = revenue * (Math.max(0, uplift) / 100);
    const rate = visitors > 0 ? (conv / visitors) * 100 : 0;
    return { currentOrders: orders, currentRevenue: revenue, additional: extra, startRate: rate };
  }, [visitors, conversations, convRate, aov, uplift]);

  const animatedAdditional = useCountUp(additional);
  const animatedRevenue = useCountUp(currentRevenue);
  const animatedOrders = useCountUp(currentOrders);

  return (
    <section className="lp-section lp-shell" id="roi">
      <SectionHead
        eyebrow="تخيّل بعد شهر"
        title={<>كم طلبًا يتسرّب من <span className="lp-gtext">متجرك كل شهر</span>؟</>}
        lead="أدخل أرقامك — الحساب كله من بياناتك أنت."
      />

      <Reveal className="lp-roi">
        <div className="lp-roi__inputs">
          <NumberField
            id="roi-visitors"
            label="الزوار الشهريون لمتجرك"
            value={visitors}
            min={0}
            step={100}
            onChange={setVisitors}
          />
          <NumberField
            id="roi-conversations"
            label="عدد المحادثات الشهرية"
            value={conversations}
            min={0}
            step={10}
            onChange={setConversations}
          />
          <NumberField
            id="roi-rate"
            label="معدل التحويل الحالي"
            unit="%"
            value={convRate}
            min={0}
            max={100}
            onChange={setConvRate}
          />
          <NumberField
            id="roi-aov"
            label="متوسط قيمة الطلب"
            unit="د.ع"
            value={aov}
            min={0}
            step={1000}
            onChange={setAov}
          />

          <div className="lp-field">
            <label htmlFor="roi-uplift">
              تحسّن متوقع مع ShopIQ:{" "}
              <span className="lp-field__slider-val">{uplift}%</span>
            </label>
            <input
              id="roi-uplift"
              type="range"
              min={0}
              max={100}
              step={5}
              value={uplift}
              onChange={(e) => setUplift(Number(e.target.value))}
            />
            <p className="lp-roi__note">
              هذا افتراض يمكنك تعديله بحرية — بسبب الرد الفوري على مدار الساعة وعدم ضياع أي محادثة.
            </p>
          </div>
        </div>

        <div className="lp-roi__out">
          <div className="lp-roi__result lp-roi__result--hero">
            <div className="lp-roi__result-label">الإيراد الإضافي المحتمل شهريًا</div>
            <div className="lp-roi__result-value">
              +{fmt(animatedAdditional)}
              <span className="lp-roi__result-unit">د.ع</span>
            </div>
          </div>

          <div className="lp-roi__grid">
            <div className="lp-roi__result">
              <div className="lp-roi__result-label">الطلبات الحالية / شهر</div>
              <div className="lp-roi__result-value" style={{ fontSize: "1.6rem" }}>
                {fmt(animatedOrders)}
              </div>
            </div>
            <div className="lp-roi__result">
              <div className="lp-roi__result-label">الإيراد الحالي / شهر</div>
              <div className="lp-roi__result-value" style={{ fontSize: "1.6rem" }}>
                {fmt(animatedRevenue)}
                <span className="lp-roi__result-unit">د.ع</span>
              </div>
            </div>
          </div>

          <p className="lp-roi__note">
            معدل بدء المحادثة من الزوار: {startRate.toFixed(1)}%. هذه الأرقام تقديرية مبنية على
            مدخلاتك، وليست وعدًا بنتائج فعلية.
          </p>
        </div>
      </Reveal>
    </section>
  );
}
