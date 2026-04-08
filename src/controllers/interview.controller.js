const { tempResult: generateInterviewReport } = require("../services/test");
const { interviewReportModel } = require("../modules/interviewReport");

async function generateInterviewReportController(req, res) {
    if (!req.file?.buffer) {
        return res.status(400).json({
            message: "Resume PDF is required",
        });
    }

    let resumeText = "";
    try {
        // Lazy-load parser so a parser/runtime mismatch does not crash server startup.
        const pdfParse = require("pdf-parse");
        const parsedResume = await pdfParse(req.file.buffer);
        resumeText = parsedResume?.text ?? "";
    } catch (error) {
        return res.status(400).json({
            message: "Failed to parse resume PDF",
            error: error.message,
        });
    }

    // Accept both camelCase and lowercase field names from clients.
    const selfdescription = req.body.selfdescription ?? req.body.selfDescription;
    const jobdescription = req.body.jobdescription ?? req.body.jobDescription;

    const result = await generateInterviewReport({
        resume: resumeText,
        selfdescription,
        jobdescription,
    })

    const userId = req.user?._id || req.user?.id;

    const interviewReport = await interviewReportModel.create({
        user: userId,
        resume: resumeText,
        selfDescription: selfdescription,
        jobDescription: jobdescription,
        ...result,
    })

    res.status(201).json({
        message: "Interview report generated successfully",
        interviewReport,
    })
}

async function getMyInterviewReportsController(req, res) {
    const userId = req.user?._id || req.user?.id;

    if (!userId) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }

    const reports = await interviewReportModel
        .find({ user: userId })
        .sort({ createdAt: -1 })
        .lean();

    return res.status(200).json({
        reports,
    });
}

async function getInterviewReportByIdController(req, res) {
    const userId = req.user?._id || req.user?.id;
    const { reportId } = req.params;

    if (!userId) {
        return res.status(401).json({
            message: "Unauthorized",
        });
    }

    const interviewReport = await interviewReportModel
        .findOne({ _id: reportId, user: userId })
        .lean();

    if (!interviewReport) {
        return res.status(404).json({
            message: "Report not found",
        });
    }

    return res.status(200).json({
        interviewReport,
    });
}


module.exports = {
    generateInterviewReportController,
    getMyInterviewReportsController,
    getInterviewReportByIdController,
}
