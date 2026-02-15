import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export default async function handler(req, res) {
  // Only allow POST
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const { imageDataUrl } = req.body;

    if (!imageDataUrl || !imageDataUrl.startsWith("data:image/")) {
      return res.status(400).json({ error: "Invalid or missing imageDataUrl" });
    }

    // Basic size protection (Vercel limit safety)
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
- Format each line as:

  SEG#  CARRIER  FLT#  CLASS  DATE  ORG DEST  DEPT ARR

Formatting rules:
- Use 24-hour time.
- Add +1 if arrival is next day.
- If 1 stop is shown, split into separate flight segments.
- Do NOT invent connection cities or times unless explicitly shown.
- If connection details are missing, use placeholder times 0000 0000.
- Default class mapping:
    Economy = Y
    Premium Economy = W
    Business = J
    First = F
`;

    const response = await openai.responses.create({
      model: "gpt-4.1-mini",
      temperature: 0,
      input: [
        {
          role: "user",
          content: [
            { type: "input_text", text: prompt },
            { type: "input_image", image_url: imageDataUrl }
          ]
        }
      ]
    });

    const sabreText =
      response.output_text ||
      response.output?.map(o =>
        o.content?.map(c => c.text || "").join("")
      ).join("\n") ||
      "";

    return res.status(200).json({ sabreText: sabreText.trim() });

  } catch (error) {
    console.error("Image conversion error:", error);
    return res.status(500).json({ error: "Image conversion failed" });
  }
}
