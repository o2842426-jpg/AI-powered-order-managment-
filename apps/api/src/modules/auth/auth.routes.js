const express = require("express");
const { register, login, createStoreWithOwner } = require("./auth.controller");

const authRouter = express.Router();

authRouter.post("/register", register);
authRouter.post("/login", login);
authRouter.post("/create-store", createStoreWithOwner);

module.exports = { authRouter };
