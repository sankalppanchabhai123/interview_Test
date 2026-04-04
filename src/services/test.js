require("dotenv").config();
const Groq = require("groq-sdk");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well candidate's profile matches the job description"),
    interviewQuestion: z.array(z.object({
        question: z.string().describe("The technical question that can be asked in the interview"),
        intention: z.string().describe("The intention of the interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc."),
    })).describe("Technical questions that can be asked in the interview along with their intention and how to answer them"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The behavioral question that can be asked in the interview"),
        intention: z.string().describe("The intention of the interviewer behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take"),
    })).describe("Behavioral questions that can be asked in the interview along with their intention and how to answer them"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low", "medium", "high"]).describe("The severity of this skill gap"),
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("The day number in the preparation plan, starting from 1"),
        focus: z.string().describe("The main focus of this day, e.g. data structures, system design, mock interviews"),
        tasks: z.array(z.string()).describe("List of tasks to be done on this day"),
    })).describe("A day-wise preparation plan for the candidate"),
});

function parseJsonContent(content) {
    if (!content || typeof content !== "string") {
        throw new Error("Empty response from Groq");
    }

    try {
        return JSON.parse(content);
    } catch {
        const objectMatch = content.match(/\{[\s\S]*\}/);
        if (!objectMatch) {
            throw new Error("Response was not valid JSON");
        }
        return JSON.parse(objectMatch[0]);
    }
}

function extractReportPayload(payload) {
    if (!payload || typeof payload !== "object") {
        return payload;
    }
    const directKeys = [
        "matchScore",
        "interviewQuestion",
        "interviewQuestions",
        "technicalQuestions",
        "behavioralQuestions",
        "behaviouralQuestions",
        "skillGaps",
        "preparationPlan",
    ];
    const hasDirectShape = directKeys.some((key) => Object.prototype.hasOwnProperty.call(payload, key));
    if (hasDirectShape) {
        return payload;
    }

    const candidateKeys = ["report", "interviewReport", "result", "data", "output", "response"];
    for (const key of candidateKeys) {
        const candidate = payload[key];
        if (candidate && typeof candidate === "object") {
            const hasShape = directKeys.some((k) => Object.prototype.hasOwnProperty.call(candidate, k));
            if (hasShape) {
                return candidate;
            }
        }
    }

    const values = Object.values(payload);
    if (values.length === 1 && values[0] && typeof values[0] === "object") {
        return values[0];
    }

    return payload;
}

function toNumber(value, fallback = 0) {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string") {
        const match = value.match(/\d+(\.\d+)?/);
        if (match) {
            return Number(match[0]);
        }
    }
    return fallback;
}

function normalizeQuestionItem(item) {
    if (typeof item === "string") {
        return {
            question: item,
            intention: "Assess candidate understanding and communication.",
            answer: "Explain approach clearly with concrete examples.",
        };
    }

    return {
        question: item?.question ?? item?.interviewQuestion ?? item?.interviewQuestions ?? "",
        intention: item?.intention ?? item?.intension ?? "Assess candidate understanding and communication.",
        answer: item?.answer ?? item?.sampleAnswer ?? "Explain approach clearly with concrete examples.",
    };
}

function normalizeSkillGapItem(item) {
    if (typeof item === "string") {
        const lower = item.toLowerCase();
        const severity = lower.includes("high") ? "high" : lower.includes("low") ? "low" : "medium";
        return {
            skill: item,
            severity,
        };
    }

    const severityCandidate = String(item?.severity ?? item?.level ?? "medium").toLowerCase();
    const severity = ["low", "medium", "high"].includes(severityCandidate) ? severityCandidate : "medium";

    return {
        skill: item?.skill ?? item?.gap ?? item?.name ?? "Unknown skill",
        severity,
    };
}

function normalizePreparationItem(item, index) {
    if (typeof item === "string") {
        return {
            day: index + 1,
            focus: item,
            tasks: ["Revise fundamentals", "Practice interview questions"],
        };
    }

    const rawTasks = item?.tasks ?? item?.task ?? [];
    const tasks = Array.isArray(rawTasks)
        ? rawTasks.map((task) => String(task))
        : [String(rawTasks || "Practice and revise")];

    return {
        day: toNumber(item?.day, index + 1),
        focus: item?.focus ?? item?.topic ?? "Interview preparation",
        tasks,
    };
}

function normalizeReportShape(payload) {
    const technicalQuestionsSource =
        payload?.interviewQuestion ??
        payload?.interviewQuestions ??
        payload?.technicalQuestions ??
        payload?.questions;

    const behavioralQuestionsSource =
        payload?.behavioralQuestions ??
        payload?.behaviouralQuestions ??
        payload?.behaviorQuestions;

    return {
        matchScore: toNumber(payload?.matchScore, 0),
        interviewQuestion: Array.isArray(technicalQuestionsSource)
            ? technicalQuestionsSource.map(normalizeQuestionItem)
            : [],
        behavioralQuestions: Array.isArray(behavioralQuestionsSource)
            ? behavioralQuestionsSource.map(normalizeQuestionItem)
            : [],
        skillGaps: Array.isArray(payload?.skillGaps)
            ? payload.skillGaps.map(normalizeSkillGapItem)
            : [],
        preparationPlan: Array.isArray(payload?.preparationPlan)
            ? payload.preparationPlan.map(normalizePreparationItem)
            : [],
    };
}

async function generateInterviewReport({
    resume,
    selfdescription,
    jobdescription,
    selfdescribe,
    jobdescribe,
}) {
    const normalizedSelfDescription = selfdescription ?? selfdescribe;
    const normalizedJobDescription = jobdescription ?? jobdescribe;

    if (!resume || !normalizedSelfDescription || !normalizedJobDescription) {
        throw new Error("resume, selfdescription, and jobdescription are required");
    }

    const basePrompt = `Generate an interview report for a candidate with the following details:
                    Resume: ${resume}
                    Self describe: ${normalizedSelfDescription}
                    Job describe: ${normalizedJobDescription}`;

    const strictOutputInstruction = `Return ONLY valid JSON with EXACT top-level keys:
                    matchScore,
                    interviewQuestion,
                    behavioralQuestions,
                    skillGaps,
                    preparationPlan.
                    interviewQuestion must contain at least 5 items.
                    behavioralQuestions must contain at least 3 items.
                    No wrapper keys, no markdown, no explanation.`;

    try {
        let lastValidationError = null;

        for (let attempt = 1; attempt <= 2; attempt += 1) {
            const chatCompletion = await groq.chat.completions.create({
                messages: [
                    {
                        role: "system",
                        content: `You are an expert interview coach. Always respond with valid JSON only, matching this schema exactly: ${JSON.stringify(zodToJsonSchema(interviewReportSchema))}`,
                    },
                    {
                        role: "user",
                        content: `${basePrompt}\n\n${strictOutputInstruction}`,
                    },
                ],
                model: "openai/gpt-oss-20b",
                response_format: { type: "json_object" },
                temperature: attempt === 1 ? 0.3 : 0,
            });

            const jsonText = chatCompletion.choices[0]?.message?.content || "";
            const parsedPayload = parseJsonContent(jsonText);
            const extractedPayload = extractReportPayload(parsedPayload);

            const normalizedPayload = normalizeReportShape(extractedPayload);
            const validated = interviewReportSchema.safeParse(normalizedPayload);
            if (validated.success) {
                console.log("Generated Report:\n", JSON.stringify(validated.data, null, 2));
                return validated.data;
            }

            lastValidationError = validated.error;
            console.warn(`Attempt ${attempt} produced invalid schema. Retrying...`);
        }

        throw new Error(lastValidationError ? JSON.stringify(lastValidationError.issues, null, 2) : "Invalid AI response shape");

    } catch (error) {
        console.error("Groq request failed:", error.message);
        throw error;
    }
}

async function main() {
    // Example usage
    const report = await generateInterviewReport({
        resume: "5 years of experience in Node.js, React, MongoDB. Worked at startups.",
        selfdescription: "I am a full-stack developer passionate about building scalable web apps.",
        jobdescription: "Senior Full Stack Engineer role requiring React, Node.js, AWS, and system design skills.",
    });

    console.log("Match Score:", report.matchScore);
    console.log("Skill Gaps:", report.skillGaps);
}

if (require.main === module) {
    main().catch((error) => {
        console.error("Request failed:", error.message);
        process.exit(1);
    });
}

module.exports = {
    interviewReportSchema,
    tempResult: generateInterviewReport,
};