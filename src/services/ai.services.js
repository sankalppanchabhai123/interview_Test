const { GoogleGenAI } = require("@google/genai");
const { z } = require("zod");
const { zodToJsonSchema } = require("zod-to-json-schema");


const ai = new GoogleGenAI({
    apikey: process.env.GEMINI_API_KEY,
})

const interviewReportSchema = z.object({
    matchScore: z.number().describe("A score between 0 and 100 indicating how well candidate's profile matches the job describe"),
    technicalQuestions: z.array(z.object({
        question: z.string().describe("The technical questionn can not be ask in the interview"),
        intention: z.string().describe("The intention of the interviewes behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach to take etc."),
    })).describe("Technical questions that can be asked interviewReportSchemain the interview along with their intetion and how to answer tham"),
    behavioralQuestions: z.array(z.object({
        question: z.string().describe("The technical questionn can not be ask in the interview"),
        intention: z.string().describe("The intention of the interviewes behind asking this question"),
        answer: z.string().describe("How to answer this question, what points to cover, what approach "),
    })).describe("Behavioral questions that can be asked in the interview along with their intetion and how to answer tham"),
    skillGaps: z.array(z.object({
        skill: z.string().describe("The skill which the candidate is lacking"),
        severity: z.enum(["low", "medium", "high"]).describe("The severity of this skill gap, i.e."),
    })).describe("List of skill gaps in the candidate's profile along with their severity"),
    preparationPlan: z.array(z.object({
        day: z.number().describe("Theday number in the preparation plan , starting from 1"),
        focus: z.string().describe("The main focus of this day in the preparation plan, eg. data structures, system design, mock interviews"),
        tasks: z.array(z.string()).describe("Loist of tasks to be done on this day to follow the preparation plan, e.g read a specific book or something else"),
    })).describe("A day-wise preparation plan for the candidate to follow in order to prepare for the interview effectively"),
})


async function generateInterviewReport({ resume, selfdescribe, jobdescribe }) {
    const prompt = `Generate an interview report for a candidate with the following details:
                    Resume:${resume}
                    Self describe: ${selfdescribe}
                    Job describe: ${jobdescribe}
                    
                    Return the response in the specified JSON schema format.`;

    try {
        const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
                {
                    role: "user",
                    parts: [{ text: prompt }]
                }
            ],
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: zodToJsonSchema(interviewReportSchema)
            }
        })

        const result = response.text;
        console.log("Generated Report:", result);
        // return result;
    } catch (error) {
        console.error("Error generating interview report:", error.message);
        throw error;
    }
}

module.exports = {
    tempResult: generateInterviewReport,
}