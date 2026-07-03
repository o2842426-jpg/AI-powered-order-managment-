/** @readonly */
const ORDER_STATES = {
  AWAITING_PRODUCT: "AWAITING_PRODUCT",
  AWAITING_LOCATION: "AWAITING_LOCATION",
  AWAITING_PHONE: "AWAITING_PHONE",
  CONFIRMED_AWAITING_FINALIZE: "CONFIRMED_AWAITING_FINALIZE",
  CONFIRMED: "CONFIRMED",
};

const VALID_ORDER_STATES = new Set(Object.values(ORDER_STATES));

const IRAQI_GOVERNORATES = [
  "بغداد",
  "البصرة",
  "نينوى",
  "الموصل",
  "أربيل",
  "اربيل",
  "كركوك",
  "السليمانية",
  "سليمانية",
  "النجف",
  "كربلاء",
  "ديالى",
  "الأنبار",
  "انبار",
  "ذي قار",
  "بابل",
  "واسط",
  "ميسان",
  "المثنى",
  "صلاح الدين",
  "دهوك",
];

module.exports = {
  ORDER_STATES,
  VALID_ORDER_STATES,
  IRAQI_GOVERNORATES,
};
