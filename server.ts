import express from "express";
import path from "path";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Use a higher limit for image uploads
  app.use(express.json({ limit: "50mb" }));

  // The user explicitly requested to use this API key to make it work seamlessly on GitHub
  const apiKey = process.env.GEMINI_API_KEY || "AIzaSyCQDZgyTH8wZN_D_28q1IdyfygFRuL_Nlw";
  let ai: GoogleGenAI | null = null;
  if (apiKey) {
    try {
      ai = new GoogleGenAI({ apiKey });
    } catch (e) {
      console.warn("Failed to initialize GoogleGenAI");
    }
  }

  // In-memory history for recently analyzed items
  const analysisHistory: any[] = [];

  app.post("/api/analyze-text", async (req, res) => {
    try {
      const { text } = req.body;
      if (!ai) throw new Error("API key missing. Failed to initialize GoogleGenAI.");

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: `Analyze the following text or claim for its truthfulness and logic.
Text: "${text}"

Provide a strict, professional fact-check. Look for clickbait terms, logical fallacies, and factual accuracy.
Respond entirely in Korean.
Return the result strictly as a JSON object matching the requested schema.`,
        config: {
          tools: [{ googleSearch: {} }],
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER, description: "A trust score from 0 to 100." },
              status: { type: Type.STRING, description: "One of: 사실, 의심, 거짓, 판단불가" },
              reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "List of reasons in Korean." }
            },
            required: ["score", "status", "reasons"]
          }
        }
      });

      const rawJson = response.text || "{}";
      const sources: any[] = [];
      const chunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
      if (chunks) {
        chunks.forEach((c: any) => {
          if (c.web?.uri) {
            sources.push({ title: c.web.title, url: c.web.uri });
          }
        });
      }

      const parsedData = JSON.parse(rawJson.trim());
      const result = { ...parsedData, sources };

      // Push to history
      analysisHistory.unshift({ 
        id: String(Date.now()), 
        type: "text", 
        content: text.substring(0, 80) + (text.length > 80 ? "..." : ""), 
        result, 
        timestamp: Date.now() 
      });
      if (analysisHistory.length > 20) analysisHistory.pop();

      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to analyze text." });
    }
  });

  app.post("/api/analyze-image", async (req, res) => {
    try {
      const { base64Data, mimeType, exifInfo } = req.body;
      if (!ai) throw new Error("API key missing. Failed to initialize GoogleGenAI.");

      const exifContext = exifInfo && Object.keys(exifInfo).length > 0 
        ? `Image EXIF Data: ${JSON.stringify(exifInfo)}` 
        : 'No EXIF data found.';
      
      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: {
          parts: [
            { inlineData: { mimeType: mimeType || "image/png", data: base64Data } },
            { text: `Analyze this image for signs of manipulation, AI generation, or false context. \n${exifContext}\n\nRespond entirely in Korean.\nReturn the result strictly as a JSON object matching the requested schema.` }
          ]
        },
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              score: { type: Type.INTEGER, description: "A trust score from 0 to 100. AI-generated gives a very low score." },
              status: { type: Type.STRING, description: "One of: 원본, 조작됨, AI생성, 의심" },
              reasons: { type: Type.ARRAY, items: { type: Type.STRING }, description: "Visual inconsistencies, EXIF discrepancies, or signs of AI generation in Korean." }
            },
            required: ["score", "status", "reasons"]
          }
        }
      });

      const rawJson = response.text || "{}";
      const result = JSON.parse(rawJson.trim());

      // Push to history
      analysisHistory.unshift({ 
        id: String(Date.now()), 
        type: "image", 
        content: "업로드된 이미지 검증 건", 
        result, 
        timestamp: Date.now() 
      });
      if (analysisHistory.length > 20) analysisHistory.pop();

      res.json(result);
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: error.message || "Failed to analyze image." });
    }
  });

  app.get("/api/history", (req, res) => {
    res.json(analysisHistory);
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
