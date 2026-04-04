const pdfParse = require("pdf-parse")
const { tempResult: generateInterviewReport } = require("../services/test");
const { interviewReportModel } = require("../modules/interviewReport");

async function generateInterviewReportController(req, res) {

    const data = new Uint8Array(
        req.file.buffer.buffer,
        req.file.buffer.byteOffset,
        req.file.buffer.byteLength
    );

    const resumeContent = await (new pdfParse.PDFParse(data)).getText();

    // Accept both camelCase and lowercase field names from clients.
    const selfdescription = req.body.selfdescription ?? req.body.selfDescription;
    const jobdescription = req.body.jobdescription ?? req.body.jobDescription;

    const result = await generateInterviewReport({
        resume: resumeContent.text,
        selfdescription,
        jobdescription,
    })

    const userId = req.user?._id || req.user?.id;

    const interviewReport = await interviewReportModel.create({
        user: userId,
        resume: resumeContent.text,
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
