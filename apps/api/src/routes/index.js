const express = require("express");
const { authRouter } = require("../modules/auth/auth.routes");
const { productsRouter } = require("../modules/products/products.routes");
const { publicRouter } = require("../modules/public/public.routes");
const { storesRouter } = require("../modules/stores/stores.routes");
const { uploadsRouter } = require("../modules/uploads/uploads.routes");
const { billingRouter } = require("../modules/billing/billing.routes");
const apiRouter = express.Router();
const { ordersRouter } = require("../modules/orders/orders.routes");
apiRouter.get("/health", (_req, res) => {
  res.status(200).json({ ok: true, service: "dm-commerce-api" });
});

apiRouter.use("/auth", authRouter);
apiRouter.use("/billing", billingRouter);
apiRouter.use("/products", productsRouter);
apiRouter.use("/stores", storesRouter);
apiRouter.use("/uploads", uploadsRouter);
apiRouter.use("/public", publicRouter);
apiRouter.use("/orders", ordersRouter);
module.exports = { apiRouter };

