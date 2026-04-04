const mongoose = require("mongoose")
// const { applyTimestamps } = require("./schema")

const tokenblacklistschema = new mongoose.Schema({
    token: {
        type: String,
        require: true,
    }
}, { timestamps: true })

const blacklistToken = mongoose.model("blacklisttoken", tokenblacklistschema);
module.exports = blacklistToken;