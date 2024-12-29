const express = require("express");
const parsePDF = require("pdf-parse");
const cors = require("cors");
const { GoogleGenerativeAI } = require("@google/generative-ai");
require("dotenv").config();

const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Helper function to clean the AI response
const cleanResponse = (text) => {
  let cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  cleaned = cleaned.trim();

  if (!cleaned.startsWith("{")) {
    cleaned = cleaned.substring(cleaned.indexOf("{"));
  }
  if (!cleaned.endsWith("}")) {
    cleaned = cleaned.substring(0, cleaned.lastIndexOf("}") + 1);
  }

  return cleaned;
};

// Existing PDF analysis endpoint
app.post("/analyze", async (req, res) => {
  try {
    const { pdfBase64, desc } = req.body;

    if (!pdfBase64 || !desc) {
      return res.status(400).json({
        error: "Missing required fields: PDF content or job description",
      });
    }

    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const parsedText = await parsePDF(pdfBuffer).then((data) => data.text);

    const prompt = `Analyze the resume and job description in detail to provide ATS optimization recommendations. Calculate an ATS match score based on keyword matches, required skills, and formatting. Return a JSON object with the following structure:

{
  "sections": [
    {
      "title": "🎯 ATS Match Score",
      "content": "X%"
    },
    {
      "title": "🔑 Missing Keywords",
      "content": "List of specific keywords from the job description that are missing in your resume, ordered by importance. Include frequency of appearance in job description."
    },
    {
      "title": "💡 Recommended Changes",
      "content": "Specific, actionable recommendations to improve resume ATS compatibility, focusing on keyword placement and context."
    },
    {
      "title": "📝 Skills to Add",
      "content": "Prioritized list of skills mentioned in the job description that are missing from your resume, including both hard and soft skills."
    },
    {
      "title": "⚠️ Formatting Issues",
      "content": "Detailed analysis of any formatting issues that could affect ATS scanning, including section headers, bullet points, and text formatting."
    }
  ]
}

Analyze the following:

Resume: ${parsedText}

Job Description: ${desc}`;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    const cleanedResponse = cleanResponse(response);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Parse error:", parseError);
      return res.status(500).json({
        sections: [
          {
            title: "⚠️ Processing Error",
            content:
              "We encountered an error processing your resume. Please try again or contact support if the issue persists.",
          },
        ],
      });
    }

    res.json(parsedResponse);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({
      error: error.message || "Internal server error",
      sections: [
        {
          title: "Error",
          content:
            "An error occurred while processing your request. Please try again.",
        },
      ],
    });
  }
});

// New endpoint for generating professional summary
app.post("/generate-summary", async (req, res) => {
  try {
    const { jobTitle } = req.body;

    if (!jobTitle) {
      return res.status(400).json({ error: "Job title is required" });
    }

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const prompt = `Generate a professional summary and career objective for a ${jobTitle} position. 
    Format the response as JSON with two fields: 
    1. "summary" - A compelling professional summary (max 150 characters)
    2. "objective" - A focused career objective statement (max 150 characters)
    
    Make it specific to the role, highlighting relevant skills and aspirations.`;

    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    // Clean and parse the response
    const cleanedResponse = cleanResponse(response);
    const formattedResponse = JSON.parse(cleanedResponse);

    res.json(formattedResponse);
  } catch (error) {
    console.error("Error generating summary:", error);
    res.status(500).json({ error: "Failed to generate summary" });
  }
});

app.listen(8001, () => {
  console.log("Server running on port 8001");
});
