const express = require("express");
const parsePDF = require("pdf-parse");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

const app = express();

app.use(cors());
app.use(express.json({ limit: "10mb" })); // Increased limit for base64 data
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

app.post("/analyze", async (req, res) => {
  try {
    const { pdfBase64, desc } = req.body;

    if (!pdfBase64 || !desc) {
      return res.status(400).json({
        error: "Missing required fields: PDF content or job description",
      });
    }

    // Convert base64 to buffer
    const pdfBuffer = Buffer.from(pdfBase64, "base64");

    // Parse PDF directly from buffer
    const parsedText = await parsePDF(pdfBuffer).then((data) => data.text);

    console.log(parsedText);
    const prompt = `Analyze the resume and job description to provide ATS optimization recommendations. Return only a JSON object in the following structure (no markdown, no code blocks, just the raw JSON):

{
  "sections": [
    {
      "title": "🎯 ATS Match Score",
      "content": string
    },
    {
      "title": "🔑 Missing Keywords",
      "content": string
    },
    {
      "title": "💡 Recommended Changes",
      "content": string
    },
    {
      "title": "📝 Skills to Add",
      "content": string
    },
    {
      "title": "⚠️ Formatting Issues",
      "content": string
    }
  ]
}

For the resume: ${parsedText}

And the job description: ${desc}

Provide specific, actionable recommendations for ATS optimization. Focus on keyword matches, format improvements, and content suggestions. Return only the JSON object with no additional text or formatting.`;

    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const result = await model.generateContent(prompt);
    const response = await result.response.text();

    // Clean and parse the response
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
    console.log("parsedResponse", parsedResponse);

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

app.listen(8001, () => {
  console.log("Server running on port 8001");
});
