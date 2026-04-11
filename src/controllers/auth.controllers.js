const jwt = require("jsonwebtoken");
const userModel = require("../modules/schema");
const bcrypt = require("bcryptjs")
const blacklistToken = require("../modules/tokenblocklist")
const { OAuth2Client } = require("google-auth-library");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const createAuthCookie = (res, token) => {
    res.cookie("token", token, {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
};

const buildJwt = (user) => jwt.sign({
    id: user._id,
    username: user.username,
}, process.env.JWT_SECRET, { expiresIn: "1d" });

const toPublicUser = (user) => ({
    id: user._id,
    username: user.username,
    email: user.email,
});

const getBaseUsername = (value) => {
    const normalized = (value || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "");

    return normalized || "user";
};

const buildUniqueUsername = async (seedValue) => {
    const base = getBaseUsername(seedValue);
    let username = base;
    let index = 1;

    // Keep usernames deterministic and collision-safe across local + Google signups.
    while (await userModel.exists({ username })) {
        username = `${base}-${index}`;
        index += 1;
    }

    return username;
};


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

        const token = buildJwt(User);
        createAuthCookie(res, token);

        res.status(201).json({
            message: "User registered successfully",
            user: toPublicUser(User)
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

    if (!User.password) {
        return res.status(400).json({
            message: "This account uses Google Sign-In. Please continue with Google.",
        });
    }

    const getUserData = await bcrypt.compare(password, User.password);
    if (!getUserData) {
        return res.status(400).json({ "message": "incorrect password" })
    }

    const token = buildJwt(User);
    createAuthCookie(res, token);

    res.status(200).json({
        message: "user login successfully",
        user: toPublicUser(User)
    });
}

async function googleAuthController(req, res) {
    try {
        const { credential } = req.body || {};
        if (!credential) {
            return res.status(400).json({ message: "Google credential is required" });
        }

        if (!process.env.GOOGLE_CLIENT_ID) {
            return res.status(500).json({ message: "Google auth is not configured" });
        }

        const ticket = await googleClient.verifyIdToken({
            idToken: credential,
            audience: process.env.GOOGLE_CLIENT_ID,
        });

        const payload = ticket.getPayload();
        const email = (payload?.email || "").trim().toLowerCase();
        const emailVerified = Boolean(payload?.email_verified);
        const googleId = payload?.sub;
        const name = (payload?.name || "").trim();
        const picture = payload?.picture || "";

        if (!email || !googleId || !emailVerified) {
            return res.status(401).json({ message: "Invalid Google account" });
        }

        let user = await userModel.findOne({ $or: [{ email }, { googleId }] });

        if (!user) {
            const username = await buildUniqueUsername(name || email.split("@")[0]);
            user = await userModel.create({
                username,
                email,
                googleId,
                provider: "google",
                profilePicture: picture,
            });
        } else {
            const updates = {};
            if (!user.googleId) {
                updates.googleId = googleId;
            }
            if (!user.provider) {
                updates.provider = "google";
            }
            if (picture && user.profilePicture !== picture) {
                updates.profilePicture = picture;
            }

            if (Object.keys(updates).length > 0) {
                user = await userModel.findByIdAndUpdate(user._id, updates, { new: true });
            }
        }

        const token = buildJwt(user);
        createAuthCookie(res, token);

        return res.status(200).json({
            message: "Google authentication successful",
            user: toPublicUser(user),
        });
    } catch (error) {
        return res.status(500).json({
            message: "Google authentication failed",
        });
    }
}

async function logoutUserController(req, res) {
    const token = req.cookies.token

    if (token) {
        await blacklistToken.create({ token })
    }

    res.clearCookie("token", {
        httpOnly: true,      // Prevents JavaScript access (more secure)
        secure: true,        // Only sent over HTTPS (required for production)
        sameSite: 'none',    // Must match cookie attributes used during set
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
    googleAuthController,
    logoutUserController,
    getMeController,
}