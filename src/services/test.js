require("dotenv").config();
const Groq = require("groq-sdk");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");
const puppeteer = require("puppeteer");

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

async function launchPdfBrowser() {
    try {
        return await puppeteer.launch({
            headless: "new",
            args: ["--no-sandbox", "--disable-setuid-sandbox"],
        });
    } catch (puppeteerError) {
        if (!process.env.VERCEL) {
            throw puppeteerError;
        }

        try {
            const chromium = require("@sparticuz/chromium-min");
            const puppeteerCore = require("puppeteer-core");
            const executablePath = await chromium.executablePath();

            return await puppeteerCore.launch({
                args: chromium.args,
                defaultViewport: chromium.defaultViewport,
                executablePath,
                headless: chromium.headless,
            });
        } catch (serverlessError) {
            throw new Error(
                `Failed to launch browser on serverless runtime. Local launch: ${puppeteerError.message}. Serverless launch: ${serverlessError.message}`
            );
        }
    }
}

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

function extractHtmlDocument(content) {
    if (!content || typeof content !== "string") {
        return "";
    }

    const trimmed = content.trim();
    const fencedMatch = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i);
    const maybeHtml = fencedMatch ? fencedMatch[1].trim() : trimmed;

    const htmlMatch = maybeHtml.match(/<!doctype html>[\s\S]*<\/html>/i) || maybeHtml.match(/<html[\s\S]*<\/html>/i);
    if (htmlMatch) {
        return htmlMatch[0].trim();
    }

    return maybeHtml;
}

function buildHtmlFromAnyPayload(payload, fallbackText = "") {
    if (payload && typeof payload === "object") {
        const htmlCandidate = payload.html ?? payload.resumeHtml ?? payload.content;
        if (typeof htmlCandidate === "string" && htmlCandidate.trim()) {
            return extractHtmlDocument(htmlCandidate);
        }
    }

    return extractHtmlDocument(fallbackText);
}

function escapeHtml(value) {
    return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function toBulletList(rawText) {
    return String(rawText || "")
        .split(/\r?\n+/)
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => `<li>${escapeHtml(line)}</li>`)
        .join("");
}

function isLikelyResumeHeading(line) {
    const trimmed = String(line || "").trim();
    if (!trimmed) {
        return false;
    }

    const normalized = trimmed.toLowerCase().replace(/[:\-–|]+$/g, "").trim();
    if (normalized === "self description" || normalized === "job description") {
        return false;
    }

    if (/^[A-Z][A-Z\s&/()+.-]{2,}$/.test(trimmed) && trimmed.split(/\s+/).length <= 8) {
        return true;
    }

    return /^(professional summary|summary|skills|core skills|technical skills|experience|professional experience|work experience|projects|education|certifications?|achievements?|internships?|positions of responsibility|profile)$/i.test(normalized);
}

function parseResumeSections(resumeText) {
    const lines = String(resumeText || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean);

    const sections = [];
    let current = null;

    for (const line of lines) {
        if (isLikelyResumeHeading(line)) {
            current = {
                heading: line.replace(/[:\-–|]+$/g, "").trim(),
                lines: [],
            };
            sections.push(current);
            continue;
        }

        if (!current) {
            current = { heading: "Profile", lines: [] };
            sections.push(current);
        }

        current.lines.push(line);
    }

    return sections.filter((section) => section.heading && section.lines.length > 0);
}

function renderResumeSectionLines(lines) {
    return lines
        .map((line) => {
            const isBullet = /^[-*•]\s+/.test(line);
            const content = escapeHtml(line.replace(/^[-*•]\s+/, "").trim());
            return isBullet
                ? `<li>${content}</li>`
                : `<p>${content}</p>`;
        })
        .join("\n");
}

function isCompleteResumeHtml(html) {
    if (!html || typeof html !== "string") {
        return false;
    }

    const normalized = html.toLowerCase();
    const requiredTokens = ["<html", "</html>", "<body", "</body>"];
    const hasHeading = /<h[1-6][^>]*>[^<]+<\/h[1-6]>/i.test(html);
    const hasForbiddenSection = /<h[1-6][^>]*>\s*(self description|job description)\s*<\/h[1-6]>/i.test(html);

    return requiredTokens.every((token) => normalized.includes(token)) && hasHeading && !hasForbiddenSection;
}

function buildFallbackResumeHtml({ resume }) {
    const sections = parseResumeSections(resume);
    const topLines = String(resume || "")
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .slice(0, 2);
    const title = escapeHtml(topLines[0] || "Professional Resume");
    const subtitle = escapeHtml(topLines[1] || "Optimized resume draft");

    const renderedSections = sections.length > 0
        ? sections
            .filter((section) => !/^(self description|job description)$/i.test(section.heading))
            .map((section) => `
    <section>
        <h2>${escapeHtml(section.heading)}</h2>
        <div class="section-content">
            ${renderResumeSectionLines(section.lines)}
        </div>
    </section>`)
            .join("\n")
        : `
    <section>
        <h2>Resume</h2>
        <p>${escapeHtml(resume || "No resume content found.")}</p>
    </section>`;

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Generated Resume</title>
    <style>
        body { font-family: Arial, Helvetica, sans-serif; color: #1f2937; margin: 0; padding: 30px; line-height: 1.35; text-align: left; font-size: 11pt; }
        .header { border-bottom: 2px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; text-align: left; }
        section { border-top: 1px solid #d1d5db; padding-top: 12px; margin-top: 14px; }
        section:first-of-type { border-top: none; padding-top: 0; margin-top: 0; }
        h1 { margin: 0; color: #111827; font-size: 20px; text-align: left; }
        h2 { color: #1d4ed8; font-size: 15px; margin: 8px 0 6px; text-align: left; }
        p { margin: 0; white-space: pre-wrap; text-align: left; }
        ul { margin: 6px 0 0 18px; padding: 0; }
        li { margin-bottom: 4px; text-align: left; }
        .muted { color: #4b5563; font-size: 12px; margin-top: 10px; text-align: left; }
        .section-content { display: grid; gap: 6px; }
    </style>
</head>
<body>
    <div class="header">
        <h1>${title}</h1>
        <div class="muted">${subtitle}</div>
    </div>
${renderedSections}
</body>
</html>`;
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


async function generateResumePdf({ resume, selfDescription, jobDescription }) {
    const resumeHtmlSchema = z.object({
        html: z.string().describe("Valid HTML content of the resume that can be converted to PDF")
    });

    if (!resume) {
        throw new Error("resume is required");
    }

    const normalizedSelfDescription = selfDescription ?? "";
    const normalizedJobDescription = jobDescription ?? "";

    const basePrompt = `Generate an optimized resume in HTML format for a candidate.

                          Primary source resume (must preserve structure and headings):
                          Resume: ${resume}

                          Additional context for optimization only (do not output as separate sections):
                          Self Description: ${normalizedSelfDescription}
                          Job Description: ${normalizedJobDescription}

                          Goal:
                          Improve selection chances by refining wording for impact and relevance while preserving the resume's original layout pattern.

                          Format and structure requirements:
                          1) Keep the same section headings and same section order as they appear in the source resume.
                          2) Keep the same overall text alignment and resume style pattern from the source resume.
                          3) Do not add any new section named "Self Description" or "Job Description".
                          4) Preserve candidate facts from the source resume. Do not invent employers, degrees, certifications, dates, or metrics.
                          5) Rewrite only the section content to improve clarity, impact, and ATS relevance.
                          6) Keep concise clean styling suitable for PDF printing.
                          
                        `;

    const strictOutputInstruction = `Return ONLY valid JSON with a single top-level key:
                    html
                    The html field must contain complete, valid HTML that can be converted to PDF.
                    Include proper HTML structure with head and body tags.
                    Keep the same section headings and order found in the source resume.
                    Do not include sections titled Self Description or Job Description.
                    Keep alignment/style pattern consistent with the source resume.
                    Keep content complete without truncation.
                    No wrapper keys, no markdown, no explanation.`;

    const rawHtmlFallbackInstruction = `If JSON formatting fails, return only a complete HTML document.
                    Start with <!DOCTYPE html> and include full <html>, <head>, and <body> tags.
                    Do not add markdown fences or explanations.`;

    try {
        // Step 1: Generate HTML from AI
        console.log("Generating resume HTML...");
        let html = "";
        let lastAttemptError = null;

        for (let attempt = 1; attempt <= 3; attempt += 1) {
            const isJsonMode = attempt === 1;
            let modelText = "";

            try {
                const chatCompletion = await groq.chat.completions.create({
                    messages: [
                        {
                            role: "system",
                            content: "You are an expert resume writer. Generate professional resumes in valid HTML format.",
                        },
                        {
                            role: "user",
                            content: `${basePrompt}\n\n${attempt <= 2 ? strictOutputInstruction : rawHtmlFallbackInstruction}`,
                        },
                    ],
                    model: "openai/gpt-oss-20b",
                    ...(isJsonMode ? { response_format: { type: "json_object" } } : {}),
                    temperature: attempt === 1 ? 0.3 : 0,
                });

                modelText = chatCompletion.choices[0]?.message?.content || "";
            } catch (attemptError) {
                lastAttemptError = attemptError;
                const apiError = attemptError?.error ?? {};
                const shouldRetry =
                    apiError?.code === "json_validate_failed" ||
                    apiError?.type === "invalid_request_error" ||
                    attempt < 3;

                console.warn(`Resume HTML generation attempt ${attempt} API error: ${attemptError.message}`);
                if (shouldRetry) {
                    continue;
                }
                throw attemptError;
            }

            if (attempt <= 2) {
                try {
                    const parsedPayload = parseJsonContent(modelText);
                    const validated = resumeHtmlSchema.safeParse(parsedPayload);
                    if (validated.success) {
                        html = extractHtmlDocument(validated.data.html);
                        break;
                    }

                    const htmlFromPayload = buildHtmlFromAnyPayload(parsedPayload, modelText);
                    if (htmlFromPayload) {
                        html = htmlFromPayload;
                        break;
                    }
                } catch {
                    const htmlFromText = buildHtmlFromAnyPayload(null, modelText);
                    if (htmlFromText) {
                        html = htmlFromText;
                        break;
                    }
                }
            } else {
                html = buildHtmlFromAnyPayload(null, modelText);
                if (html) {
                    break;
                }
            }

            console.warn(`Resume HTML generation attempt ${attempt} failed, retrying...`);
        }

        if (!html) {
            console.warn("AI resume HTML generation failed. Using local fallback template.");
            if (lastAttemptError) {
                console.warn("Last AI generation error:", lastAttemptError.message);
            }
            html = buildFallbackResumeHtml({ resume });
        }

        if (!isCompleteResumeHtml(html)) {
            console.warn("Generated HTML is incomplete or missing required sections. Using local fallback template.");
            html = buildFallbackResumeHtml({ resume });
        }

        console.log("Resume HTML generated successfully");

        // Step 2: Convert HTML to PDF using Puppeteer
        console.log("Converting HTML to PDF...");
        const browser = await launchPdfBrowser();

        try {
            const page = await browser.newPage();

            // Set content and wait for network to be idle
            await page.setContent(html, { waitUntil: 'networkidle0' });

            // Generate PDF
            const pdfBuffer = await page.pdf({
                format: 'A4',
                margin: {
                    top: '0.5in',
                    right: '0.5in',
                    bottom: '0.5in',
                    left: '0.5in'
                },
                printBackground: true
            });

            console.log("PDF generated successfully");
            return pdfBuffer;

        } finally {
            await browser.close();
        }

    } catch (error) {
        console.error("Resume PDF generation failed:", error.message);
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
    generateResumePdf,
    tempResult: generateInterviewReport,
};