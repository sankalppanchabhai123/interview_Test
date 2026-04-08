const express = require("express");
const authRoute = require("./routes/auth.routes");
const cookieParser = require("cookie-parser")
const cors = require("cors");
const interviewroute = require("./routes/interview.routes");
const app = express();

const allowedOrigins = [
    "http://localhost:5173",
    "http://localhost:5174",
    "https://interview-ai-api-nu.vercel.app",
    process.env.FRONTEND_URL,
].filter(Boolean);

const vercelPreviewPattern = /^https:\/\/[a-z0-9-]+\.vercel\.app$/i;

app.use(cors({
    origin: (origin, callback) => {
        // Allow server-to-server requests and same-origin requests with no Origin header.
        if (!origin) {
            return callback(null, true);
        }

        if (allowedOrigins.includes(origin) || vercelPreviewPattern.test(origin)) {
            return callback(null, origin);
        }

        return callback(new Error("Not allowed by CORS"));
    },
    credentials: true
}))


app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

app.get('/', (req, res) => {
    return res.send("server is in building phase");
})

app.get('/health', (req, res) => {
    return res.status(200).json({ status: "ok" });
})

app.use("/api/auth/", authRoute);
app.use("/api/interview/", interviewroute);


module.exports = app;
