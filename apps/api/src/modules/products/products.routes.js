const express = require("express");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");
const {
  listProducts,
  createProduct,
  updateProduct,
  listVariants,
  createVariant,
  updateVariant,
} = require("./products.controller");

const productsRouter = express.Router();

productsRouter.use(requireAuth);
productsRouter.use(requireActiveSubscription);
productsRouter.get("/", listProducts);
productsRouter.post("/", createProduct);
productsRouter.patch("/:id", updateProduct);
productsRouter.get("/:id/variants", listVariants);
productsRouter.post("/:id/variants", createVariant);
productsRouter.patch("/:id/variants/:variantId", updateVariant);

module.exports = { productsRouter };
