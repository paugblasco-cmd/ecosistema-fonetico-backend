import express from "express";
import fetch from "node-fetch";
import multer from "multer";
import dotenv from "dotenv";
import cors from "cors";
import puppeteer from "puppeteer-core";

dotenv.config();

const app = express();

// ⭐ CORS COMPLETO
app.use(cors({
  origin: "*",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));

app.options("*", cors());

// ⭐ IMPORTANTE: JSON + URLENCODED para IA, STT, TTS
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

const upload = multer();


// ===============================
// 1) CHAT IA (GROQ)
// ===============================
app.post("/api/chat-ia", async (req, res) => {
  try {
    const { prompt } = req.body;

    const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.GROQ_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          {
            role: "system",
            content:
              "Eres una maestra de infantil experta en Jolly Phonics e inclusión. Devuelves SIEMPRE la respuesta en HTML limpio."
          },
          { role: "user", content: prompt }
        ]
      })
    });

    const data = await groqRes.json();
    const texto = data?.choices?.[0]?.message?.content || "No se pudo generar contenido.";

    res.json({ texto });

  } catch (error) {
    console.error("Error en /api/chat-ia:", error);
    res.status(500).json({ error: "Error en el servidor de IA" });
  }
});


// ===============================
// 2) STT (DEEPGRAM)
// ===============================
app.post("/api/stt", upload.single("audio"), async (req, res) => {
  try {
    const audioBuffer = req.file.buffer;

    const dgRes = await fetch("https://api.deepgram.com/v1/listen", {
      method: "POST",
      headers: {
        "Authorization": `Token ${process.env.DEEPGRAM_API_KEY}`,
        "Content-Type": "audio/wav"
      },
      body: audioBuffer
    });

    const data = await dgRes.json();
    const texto = data?.results?.channels?.[0]?.alternatives?.[0]?.transcript || "No se pudo transcribir.";

    res.json({ texto });
  } catch (error) {
    console.error("Error en /api/stt:", error);
    res.status(500).json({ error: "Error en el servidor STT" });
  }
});


// ===============================
// 3) TTS (ELEVENLABS)
// ===============================
app.post("/api/tts", async (req, res) => {
  try {
    const { texto } = req.body;

    const ttsRes = await fetch("https://api.elevenlabs.io/v1/text-to-speech/EXAVITQu4vr4xnSDxMaL", {
      method: "POST",
      headers: {
        "xi-api-key": process.env.ELEVENLABS_API_KEY,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        text: texto,
        voice_settings: {
          stability: 0.4,
          similarity_boost: 0.7
        }
      })
    });

    const audioBuffer = await ttsRes.arrayBuffer();

    res.set({
      "Content-Type": "audio/mpeg",
      "Content-Length": audioBuffer.byteLength
    });

    res.send(Buffer.from(audioBuffer));
  } catch (error) {
    console.error("Error en /api/tts:", error);
    res.status(500).json({ error: "Error en el servidor TTS" });
  }
});


// ===============================
// 4) GENERAR PDF (PUPPETEER CORE + CHROME REAL)
// ===============================

// ⭐ RUTA EXACTA DE CHROME EN WINDOWS
const CHROME_PATH = "C:/Program Files/Google/Chrome/Application/chrome.exe";

// ⭐ SOLO ESTA RUTA USA TEXTO PLANO
app.post("/api/pdf", express.text({ limit: "5mb" }), async (req, res) => {
  try {
    const html = req.body;

    if (!html || html.trim() === "") {
      return res.status(400).json({ error: "HTML vacío" });
    }

    const browser = await puppeteer.launch({
      headless: "new",
      executablePath: CHROME_PATH,
      args: ["--no-sandbox", "--disable-setuid-sandbox"]
    });

    const page = await browser.newPage();

    const htmlFinal = `
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          body {
            font-family: "Patrick Hand", sans-serif;
            padding: 40px;
            font-size: 18px;
            line-height: 1.5;
          }
          h1 { color: #1d4ed8; }
          h2 { margin-top: 25px; }
          ul { margin-left: 20px; }
        </style>
        <link href="https://fonts.googleapis.com/css2?family=Patrick+Hand&display=swap" rel="stylesheet">
      </head>
      <body>
        ${html}
      </body>
      </html>
    `;

    await page.setContent(htmlFinal, { waitUntil: "networkidle0" });

    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "40px", bottom: "40px", left: "40px", right: "40px" }
    });

    await browser.close();

    res.set({
      "Content-Type": "application/pdf",
      "Content-Length": pdfBuffer.length
    });

    res.send(pdfBuffer);

  } catch (error) {
    console.error("❌ Error generando PDF:", error);
    res.status(500).json({ error: "Error generando PDF" });
  }
});


// ===============================
// INICIAR SERVIDOR
// ===============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor backend funcionando en puerto ${PORT}`);
});
