/**
 * API endpoint for AI-powered material extraction from experimental designs
 * Uses OpenAI to parse complex material lists
 */

import { NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"
import { getServerProfile } from "@/lib/server/server-chat-helpers"
import { checkApiKey } from "@/lib/server/server-chat-helpers"

export const runtime = "edge"

export async function POST(request: NextRequest) {
  try {
    const { materialsText, preparationText } = await request.json()

    if (!materialsText && !preparationText) {
      return NextResponse.json(
        { error: "No text provided for extraction" },
        { status: 400 }
      )
    }

    // Get user profile for API key
    const profile = await getServerProfile()
    checkApiKey(profile.openai_api_key, "OpenAI")

    const openai = new OpenAI({
      apiKey: profile.openai_api_key || "",
      organization: profile.openai_organization_id
    })

    const fullText = [materialsText, preparationText]
      .filter(Boolean)
      .join("\n\n")

    const prompt = `Extract all materials and reagents from the following experimental design text. For each material, identify:
1. Material name (clean, without extra details like catalog numbers or brands)
2. Quantity per experimental run (if specified)
3. Unit of measurement

Return ONLY a valid JSON array with this exact structure:
[
  {
    "name": "material name",
    "quantityPerRun": number (use 0 if not specified),
    "unit": "unit" (use "units" if not specified)
  }
]

Rules:
- Extract each distinct material separately (split comma-separated items)
- Remove catalog numbers (e.g., "CAS 74-79-3", "Eppendorf 022363204"), brand names (e.g., "Sigma-Aldrich", "Gilson"), and specifications from the name
- For concentration specifications like "180 mg/ml formulation", extract as quantity 0 since it's a concentration, not a per-run amount
- Use standard units: mL, L, µL, mg, g, kg, µg, units, plates, wells, tubes, samples, each
- If a range is given (e.g., "2-3 g"), use the average (2.5)
- Ignore general PPE items (gloves, coats, goggles) and general equipment (balances, pH meters, viscometers) unless they're consumables with quantities
- If no quantity is specified, set quantityPerRun to 0
- Clean up material names: "analytical grade arginine" -> "Arginine", "deionized water" -> "Deionized water"

Experimental design text:
${fullText}

JSON array:`

    // Make non-streaming request for extraction
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content:
            "You are a scientific material extraction assistant. Extract materials accurately and return ONLY valid JSON with no markdown formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1,
      max_tokens: 2000,
      stream: false
    })

    const content = response.choices[0]?.message?.content?.trim() || ""

    // Remove markdown code blocks if present
    let jsonText = content
    if (jsonText.startsWith("```")) {
      jsonText = jsonText
        .replace(/^```(?:json)?\n?/, "")
        .replace(/\n?```$/, "")
        .trim()
    }

    // Parse and validate
    const parsed = JSON.parse(jsonText)

    if (!Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "Invalid response format from AI" },
        { status: 500 }
      )
    }

    // Validate and clean each material
    const materials = parsed
      .filter((item: any) => {
        return (
          item &&
          typeof item.name === "string" &&
          item.name.trim().length > 0 &&
          typeof item.quantityPerRun === "number" &&
          typeof item.unit === "string"
        )
      })
      .map((item: any) => ({
        name: item.name.trim(),
        quantityPerRun: Number(item.quantityPerRun) || 0,
        unit: item.unit.trim() || "units",
        notes: item.notes
      }))

    return NextResponse.json({ materials })
  } catch (error: any) {
    console.error("[EXTRACT_MATERIALS] Error:", error)

    let errorMessage = error.message || "An unexpected error occurred"
    const errorCode = error.status || 500

    if (errorMessage.toLowerCase().includes("api key not found")) {
      errorMessage =
        "OpenAI API Key not found. Please set it in your profile settings."
    } else if (errorMessage.toLowerCase().includes("incorrect api key")) {
      errorMessage =
        "OpenAI API Key is incorrect. Please fix it in your profile settings."
    } else if (error instanceof SyntaxError) {
      errorMessage = "Failed to parse AI response. Please try again."
    }

    return NextResponse.json({ error: errorMessage }, { status: errorCode })
  }
}
