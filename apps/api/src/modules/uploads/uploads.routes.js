const express = require("express");
const fs = require("fs");
const path = require("path");
const multer = require("multer");
const { requireAuth } = require("../auth/auth.middleware");
const { requireActiveSubscription } = require("../billing/billing.middleware");

const uploadsRouter = express.Router();
const uploadDir = path.join(__dirname, "../../../uploads/products");

fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const safeName = `store-${req.user.store_id}-${Date.now()}-${Math.round(
      Math.random() * 1e9
    )}${ext}`;
    cb(null, safeName);
  },
});

const upload = multer({
  storage,
  limits: {
    fileSize: 10 * 1024 * 1024,
  },
  fileFilter: (_req, file, cb) => {
    if (!file.mimetype.startsWith("image/")) {
      cb(new Error("Only image files are allowed."));
      return;
    }
    cb(null, true);
  },
});

uploadsRouter.use(requireAuth);
uploadsRouter.use(requireActiveSubscription);

uploadsRouter.post("/product-image", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "image file is required." });
  }

  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/products/${
    req.file.filename
  }`;

  return res.status(201).json({
    data: {
      image_url: imageUrl,
    },
  });
});

uploadsRouter.post("/store-logo", upload.single("image"), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "image file is required." });
  }

  const imageUrl = `${req.protocol}://${req.get("host")}/uploads/products/${
    req.file.filename
  }`;

  return res.status(201).json({
    data: {
      image_url: imageUrl,
    },
  });
});

module.exports = { uploadsRouter };
