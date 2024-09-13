import { NextApiRequest, NextApiResponse } from "next"
import { OpenAI } from "openai"

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "POST") {
    try {
      const { selectedData } = req.body

      const prompt = `Generate a report outline based on the following data: ${JSON.stringify(selectedData)}`

      const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }]
      })

      const outline = completion.choices[0].message.content

      res.status(200).json({ outline })
    } catch (error) {
      res.status(500).json({ error: "Error generating outline" })
    }
  } else {
    res.setHeader("Allow", ["POST"])
    res.status(405).end(`Method ${req.method} Not Allowed`)
  }
}
