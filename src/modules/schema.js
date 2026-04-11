const mongoose = require("mongoose");


const userProfile = new mongoose.Schema({
    username: {
        type: String,
        unique: [true, "username already taken"],
        required: true,
    },
    email: {
        type: String,
        unique: [true, "email already exist in our record"],
        required: [true, "email is needed"],
    },
    password: {
        type: String,
        required: false,
    },
    googleId: {
        type: String,
        unique: true,
        sparse: true,
    },
    provider: {
        type: String,
        enum: ["local", "google"],
        default: "local",
    },
    profilePicture: {
        type: String,
        default: "",
    },
})

const usermodule = mongoose.model("users", userProfile);
module.exports = usermodule;