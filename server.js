let appInstance;
let dbConnectionPromise;

function getApp() {
    if (!appInstance) {
        appInstance = require("./src/app");
    }
    return appInstance;
}

async function ensureDbConnection() {
    if (!dbConnectionPromise) {
        const connectDb = require("./src/config/database");
        dbConnectionPromise = connectDb().catch((error) => {
            dbConnectionPromise = null;
            throw error;
        });
    }

    return dbConnectionPromise;
}

module.exports = async (req, res) => {
    try {
        const app = getApp();
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
    const app = getApp();
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