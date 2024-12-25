const fs = require("fs");
const parsePDF = require("pdf-parse");
const express = require("express");
const app = express();
const bodyParser = require("body-parser");
const multer = require("multer");
const cors = require("cors");
require("dotenv").config();

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.API_KEY);

app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, "uploads/");
  },
  filename: function (req, file, cb) {
    cb(null, file.originalname);
  },
});

const upload = multer({ storage: storage });

// Test route
app.get("/", (req, res) => {
  res.send("This is backend");
});

app.post("/upload", upload.single("pdf"), (req, res) => {
  res.send("File uploaded");
});

// Helper function to clean the AI response
const cleanResponse = (text) => {
  // Remove markdown code blocks and any other formatting
  let cleaned = text.replace(/```json\n?/g, "").replace(/```\n?/g, "");
  cleaned = cleaned.trim();

  // Handle potential leading/trailing brackets
  if (!cleaned.startsWith("{")) {
    cleaned = cleaned.substring(cleaned.indexOf("{"));
  }
  if (!cleaned.endsWith("}")) {
    cleaned = cleaned.substring(0, cleaned.lastIndexOf("}") + 1);
  }

  return cleaned;
};

app.post("/:parseresume", async (req, res) => {
  try {
    const resumename = req.params.parseresume;
    const desc = req.body.desc;

    if (!resumename || !desc) {
      return res
        .status(400)
        .json({ error: "Missing required fields: resumename or desc" });
    }

    const dataBuffer = fs.readFileSync(`uploads/${resumename}`);
    const parsedText = await parsePDF(dataBuffer).then((data) => data.text);

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

    // Clean the response before parsing
    const cleanedResponse = cleanResponse(response);

    // Log the cleaned response for debugging
    console.log("Cleaned response:", cleanedResponse);

    let parsedResponse;
    try {
      parsedResponse = JSON.parse(cleanedResponse);
    } catch (parseError) {
      console.error("Parse error:", parseError);
      console.error("Failed to parse response:", cleanedResponse);

      // Fallback response if parsing fails
      parsedResponse = {
        sections: [
          {
            title: "⚠️ Processing Error",
            content:
              "We encountered an error processing your resume. Please try again or contact support if the issue persists.",
          },
        ],
      };
    }

    res.json(parsedResponse);
  } catch (error) {
    console.error("Detailed error:", error);
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
