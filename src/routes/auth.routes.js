const express = require('express')
const authUserController = require("../controllers/auth.controllers")
const authMiddlware = require("../middlewares/auth.middleware")
const authRoute = express.Router();
// route.use()
/**
 * @route POST /api/auth/register
 * @description Register user 
 * @access Public 
 */

authRoute.post("/register", authUserController.registerUserController);

/**
 * @route POST /api/auth/login
 * @description login user with email and password 
 * @access Public 
 */
authRoute.post("/login", authUserController.loginUserController);

/**
 * @route GET /api/auth/login
 * @description login user with email and password 
 * @access Public 
 */
authRoute.post("/logout", authUserController.logoutUserController);

/**
 * @route GET /api/auth/login
 * @description middleware to check login user email and password  is correct or not
 * @access private 
 */
authRoute.get("/log-date", authMiddlware.authUser, authUserController.getMeController);
authRoute.get("/me", authMiddlware.authUser, authUserController.getMeController);


module.exports = authRoute;