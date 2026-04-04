const jwt = require("jsonwebtoken");
const blacklistToken = require("../modules/tokenblocklist");
require("dotenv").config();
async function authUser(req, res, next) {
    const token = req.cookies.token;

    if (!token) {
        return res.status(401).json({
            message: "Token not provided"
        })
    }

    const istokenblaklist = await blacklistToken.findOne({ token })
    if (istokenblaklist) {
        return res.status(401).json({ message: "Not vallid token" })
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET)

        req.user = {
            ...decoded,
            _id: decoded._id || decoded.id,
        }
        next();
    } catch (err) {
        return res.status(401).json({
            message: "Invalide token."
        })
    }
}

module.exports = {
    authUser
}