import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

function setCors(res) {
  // If you want to lock this down later, replace "*" with your allowed origin(s)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

export default async function handler(req, res) {
  setCors(res);

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageDataUrl } = req.body || {};

    if (!imageDataUrl || typeof imageDataUrl !== "string" || !imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "Invalid or missing imageDataUrl" });
    }

    // Basic size protection (base64 strings can get large fast)
    // Tune this if needed, but keep below Vercel payload constraints.
    if (imageDataUrl.length > 4_000_000) {
      return res.status(413).json({ error: "Image too large. Please use a smaller screenshot." });
    }

    const prompt = `
Convert the attached flight screenshot into Sabre GDS PNR air segment format.

Strict rules:
- Output plain text only.
- No explanations.
- No markdown.
- No code blocks.
- Use ONLY information visible in the screenshot. Do not guess or infer missing details.

Codeshare Handling Rules:
- If the screenshot shows multiple airline codes for the same flight (e.g. "XX/YY 3888"):
    - The first airline code shown is the marketing carrier.
    - Use the marketing carrier code as the segment carrier.
    - Use the flight number show with that marketing carrier.
    - Do NOT substitue the carrier code into the segment line. 
    - Add a new line directly under the segment:
    OPERATED BY [FULL AIRLINE NAME]
- Never output the operating carrier code as the main segment unless it is the only carrier shown.

Output format (one segment per line):
  SEG#  CARRIER  FLT#  CLASS  DATE  ORG DEST  DEPT ARR

Formatting rules:
- Use 24-hour time.
- Add +1 if arrival is next day.
- If the screenshot shows multiple flight numbers for a journey (e.g. 1 stop), output one segment per flight number shown.
- If a required value is not visible, use placeholders and DO NOT guess:
  - Unknown carrier: XX
  - Unknown flight number: 0000
  - Unknown date: 01JAN
  - Unknown airport: XXX
  - Unknown times: 0000 0000
- Default class mapping if cabin is shown:
    Economy = Y
    Premium Economy = W
    Business = J
    First = F
- If cabin/class is not shown, use Y.
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl },
          ],
        },
      ],
    });

    const sabreTextRaw =
      response.output_text ||
      response.output
        ?.map((o) => o.content?.map((c) => c.text || "").join(""))
        .join("\n") ||
      "";

    // Normalize any weird linebreak glyphs some UIs inject
    const sabreText = sabreTextRaw
      .replace(/\r/g, "")
      .replace(/[↵]/g, "\n")
      .trim();

    return res.status(200).json({ sabreText });
  } catch (error) {
    console.error("Image conversion error:", error);

    const message =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Image conversion failed";

    const status =
      error?.status ||
      error?.response?.status ||
      500;

    return res.status(status).json({ error: message });
  }
}
