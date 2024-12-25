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
    const prompt = `Analyze the resume and job description in detail to provide ATS optimization recommendations. Calculate an ATS match score based on keyword matches, required skills, and formatting. Return a JSON object with the following structure:

{
  "sections": [
    {
      "title": "🎯 ATS Match Score",
      "content": "Your resume has an ATS match score of X% based on the following analysis:\\n- Found X out of Y required keywords (X%)\\n- Matched X out of Y required skills (X%)\\n- Format compatibility score: X%\\n\\nOverall compatibility: X%"
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

Job Description: ${desc}

Analysis Instructions:
1. Calculate ATS Match Score by:
   - Identifying all required skills and keywords in the job description
   - Counting exact and partial keyword matches in the resume
   - Evaluating formatting compatibility
   - Weighing the importance of each keyword based on frequency and context
2. Provide specific percentages in the match score
3. List missing keywords with their frequency in the job description
4. Provide actionable recommendations for improvement
5. Focus on both technical and soft skills alignment

Return only the JSON object without any markdown formatting or additional text.`;

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
