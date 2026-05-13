const express = require("express");
const { requireAdminApiKey } = require("./admin.middleware");
const { listStores, patchStore } = require("./admin.controller");

const adminRouter = express.Router();
adminRouter.use(requireAdminApiKey);

adminRouter.get("/stores", listStores);
adminRouter.patch("/stores/:storeId", patchStore);

module.exports = { adminRouter };
