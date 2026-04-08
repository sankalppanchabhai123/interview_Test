const mongoose = require("mongoose");
require("dotenv").config();

async function connectDb() {
    if (!process.env.MONGO_URL) {
        throw new Error("MONGO_URL is not set. Add it to your .env file.");
    }

    try {
        await mongoose.connect(process.env.MONGO_URL, {
            serverSelectionTimeoutMS: 5000,
            connectTimeoutMS: 5000,
            socketTimeoutMS: 20000,
        });
        console.log("db connected");
    } catch (err) {
        throw new Error(`Database connection failed: ${err.message}`);
    }
}

module.exports = connectDb;