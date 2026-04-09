const jwt = require("jsonwebtoken");
const userModel = require("../modules/schema");
const bcrypt = require("bcryptjs")
const blacklistToken = require("../modules/tokenblocklist")


/**
 * @route POST /api/auth/register
 * @description Register user 
 * @access Public 
 */
async function registerUserController(req, res) {
    try {
        const { username, email, password } = req.body || {};
        const normalizedUsername = (username || "").trim();
        const normalizedEmail = (email || "").trim().toLowerCase();

        if (!normalizedUsername || !normalizedEmail || !password) {
            return res.status(400).json({
                message: "Please provide username, email and password"
            })
        }

        const isUserAlreadyExists = await userModel.findOne({
            $or: [{ username: normalizedUsername }, { email: normalizedEmail }]
        })
        if (isUserAlreadyExists) {
            return res.status(400).json({ message: "Username or email already taken" })
        }

        const hashedPassword = await bcrypt.hash(password, 10);

        const User = await userModel.create({
            username: normalizedUsername,
            email: normalizedEmail,
            password: hashedPassword
        })

        const token = await jwt.sign({
            id: User._id,
            username: User.username,
        }, process.env.JWT_SECRET, { expiresIn: '1d' });

        res.cookie("token", token, {
            httpOnly: true,      // Prevents JavaScript access (more secure)
            secure: true,        // Only sent over HTTPS (required for production)
            sameSite: 'none',  // CSRF protection
            maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
        });

        res.status(201).json({
            message: "User registered successfully",
            user: {
                id: User._id,
                username: User.username,
                email: User.email,
            }
        })
    } catch (error) {
        if (error?.code === 11000) {
            return res.status(400).json({ message: "Username or email already taken" })
        }

        return res.status(500).json({
            message: "Failed to register user"
        })
    }
}

async function loginUserController(req, res) {
    const { email, password } = req.body || {};

    const User = await userModel.findOne({ email })
    if (!User) {
        return res.status(401).json({
            "message": "username not found"
        })
    }

    const getUserData = await bcrypt.compare(password, User.password);
    if (!getUserData) {
        return res.status(400).json({ "message": "incorrect password" })
    }

    const token = await jwt.sign({
        id: User._id,
        username: User.username,
    }, process.env.JWT_SECRET, { expiresIn: "1d" });

    res.cookie("token", token, {
        httpOnly: true,      // Prevents JavaScript access (more secure)
        secure: true,        // Only sent over HTTPS (required for production)
        sameSite: 'strict',  // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
        message: "user login successfully",
        user: {
            id: User._id,
            username: User.username,
            email: User.email,
        }
    });
}

async function logoutUserController(req, res) {
    const token = req.cookies.token

    if (token) {
        await blacklistToken.create({ token })
    }

    res.clearCookie("token", {
        httpOnly: true,      // Prevents JavaScript access (more secure)
        secure: true,        // Only sent over HTTPS (required for production)
        sameSite: 'strict',  // CSRF protection
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });

    res.status(200).json({
        message: "User logout successfully"
    })
}

async function getMeController(req, res) {
    const userId = req.user?._id || req.user?.id;
    if (!userId) {
        return res.status(401).json({
            message: "Unauthorized"
        })
    }

    const user = await userModel.findById(userId)

    if (!user) {
        return res.status(404).json({
            message: "User not found"
        })
    }

    res.status(200).json({
        user: {
            id: user._id,
            email: user.email,
            username: user.username,
        }
    })
}
module.exports = {
    registerUserController,
    loginUserController,
    logoutUserController,
    getMeController,
}