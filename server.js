const app = require("./src/app");
const connectDb = require("./src/config/database");

let dbConnectionPromise;

async function ensureDbConnection() {
    if (!dbConnectionPromise) {
        dbConnectionPromise = connectDb().catch((error) => {
            dbConnectionPromise = null;
            throw error;
        });
    }

    return dbConnectionPromise;
}

module.exports = async (req, res) => {
    try {
        const path = req.url?.split("?")[0];
        if (path === "/" || path === "/health") {
            return app(req, res);
        }

        await ensureDbConnection();
        return app(req, res);
    } catch (error) {
        console.error("Startup failed:", error.message);
        return res.status(500).json({
            message: "Server startup failed",
            error: error.message,
        });
    }
};

if (require.main === module) {
    ensureDbConnection()
        .then(() => {
            const port = process.env.PORT || 3000;
            app.listen(port, () => {
                console.log(`server listening on port ${port}`);
            });
        })
        .catch((error) => {
            console.error("Startup failed:", error.message);
            process.exit(1);
        });
}