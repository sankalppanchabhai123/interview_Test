const app = require("./src/app");
const connectDb = require("./src/config/database");
const { tempResult: generateInterviewReport } = require("./src/services/test");
const { resume, selfdescription, jobdescription } = require("./src/services/temp");

async function bootstrap() {
    await connectDb();

    // const report = await generateInterviewReport({
    //     resume,
    //     selfdescription,
    //     jobdescription,
    // });

    console.log("Interview report generated from server.js inputs");
    // console.log("Match Score:", report.matchScore);

    app.listen(3000, () => {
        console.log("server listening on port 3000");
    });
}

bootstrap().catch((error) => {
    console.error("Startup failed:", error.message);
    process.exit(1);
});