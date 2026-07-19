import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { SectionHead, Reveal } from "./ui";
import { PRODUCT_NAME } from "../../lib/brand";

const FAQS = [
  {
    q: `ما هو ${PRODUCT_NAME} بالضبط؟`,
    a: `${PRODUCT_NAME} مساعد مبيعات بالذكاء الاصطناعي يرد على عملاء متجرك في الرسائل الخاصة بالعربية، يجاوب أسئلتهم، يرشّح المنتجات، ويحوّل المحادثات إلى طلبات مؤكدة على مدار الساعة.`,
  },
  {
    q: "هل يفهم اللهجة العراقية والعربية العامية؟",
    a: "نعم. تم تصميمه خصيصًا ليفهم اللهجة العراقية والعربية الطبيعية، بما في ذلك الأسئلة الناقصة أو المكتوبة بسرعة، ويرد بأسلوب إنساني مريح.",
  },
  {
    q: "كم يستغرق الإعداد؟",
    a: "أقل من 5 دقائق. تربط حساب متجرك، تضيف منتجاتك، ويبدأ المساعد بالعمل مباشرة دون أي خبرة تقنية.",
  },
  {
    q: "هل أحتاج بطاقة ائتمانية للبدء؟",
    a: "لا. يمكنك البدء مجانًا دون إدخال أي بيانات دفع، وتجربة المنتج قبل اتخاذ أي قرار.",
  },
  {
    q: "هل يمكنني التدخّل يدويًا في المحادثة؟",
    a: "بالتأكيد. تستطيع في أي لحظة إيقاف الذكاء الاصطناعي والرد بنفسك، وعندما يطلب العميل موظفًا بشريًا يتوقف المساعد تلقائيًا وينبّهك.",
  },
  {
    q: "كيف يتعامل مع الطلبات وبيانات العملاء؟",
    a: "يستخرج اسم العميل ورقمه ومدينته والمنتج من المحادثة تلقائيًا، وينشئ طلبًا منظّمًا في لوحة التحكم بحيث لا يضيع أي طلب.",
  },
  {
    q: "هل سيطلب بيانات العميل مبكرًا ويزعجه؟",
    a: "لا. المساعد يميّز بين مرحلة التصفّح ومرحلة الشراء، فلا يطلب الاسم أو العنوان إلا بعد أن يبدي العميل رغبته الفعلية بالشراء.",
  },
  {
    q: "ما القنوات المدعومة حاليًا؟",
    a: "ندعم إنستغرام حاليًا عبر الربط الرسمي من Meta، ونعمل على إضافة واتساب قريبًا ضمن نفس المنصة الموحّدة.",
  },
  {
    q: "هل بياناتي وبيانات عملائي آمنة؟",
    a: "نعم. الاتصال يتم عبر الواجهات الرسمية، ويتم تشفير مفاتيح الربط، وكل متجر معزول تمامًا عن غيره داخل النظام.",
  },
  {
    q: "هل يمكنني تخصيص شخصية وأسلوب المساعد؟",
    a: "نعم. يمكنك ضبط نبرة الردود وشخصية المساعد وإضافة أمثلة بيعية خاصة بمتجرك ليتحدث بأسلوب علامتك التجارية.",
  },
  {
    q: "هل يمكنني الإلغاء في أي وقت؟",
    a: "نعم، لا توجد عقود ملزمة. يمكنك ترقية خطتك أو تخفيضها أو إلغاؤها في أي وقت بسهولة.",
  },
];

export function Faq() {
  const [open, setOpen] = useState(0);

  return (
    <section className="lp-section lp-shell" id="faq">
      <SectionHead
        eyebrow="آخر خطوة قبل تبدأ"
        title={<>عندك سؤال؟ <span className="lp-gtext">عندنا الجواب</span></>}
        lead="أجوبة صريحة تزيل أي تردد قبل أن تبدأ."
      />
      <Reveal className="lp-faq">
        {FAQS.map((item, i) => {
          const isOpen = open === i;
          const panelId = `faq-panel-${i}`;
          const btnId = `faq-btn-${i}`;
          return (
            <div className={`lp-faq__item${isOpen ? " is-open" : ""}`} key={item.q}>
              <button
                type="button"
                id={btnId}
                className="lp-faq__q"
                aria-expanded={isOpen}
                aria-controls={panelId}
                onClick={() => setOpen(isOpen ? -1 : i)}
              >
                <span>{item.q}</span>
                <span className="lp-faq__icon" aria-hidden="true">+</span>
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    id={panelId}
                    role="region"
                    aria-labelledby={btnId}
                    className="lp-faq__a"
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                  >
                    <p className="lp-faq__a-inner">{item.a}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </Reveal>
    </section>
  );
}
