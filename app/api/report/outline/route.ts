import { StateGraph, END, START } from "@langchain/langgraph"
import { getAzureOpenAI, getAzureOpenAIModel } from "@/lib/azure-openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import * as d3 from "d3"
import { createCanvas } from "@napi-rs/canvas"

import { tool } from "@langchain/core/tools"
import { NextResponse } from "next/server"
import { retrieveFileContent } from "./retrieval"

const openai = () => getAzureOpenAI()
const MODEL_NAME = () => getAzureOpenAIModel()

type ReportTheoryType = z.infer<typeof ReportTheorySchema>

const ReportTheorySchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string()
  })
  .required()

const VisualizationSchema = z.object({
  data: z.array(
    z.object({
      label: z.string(),
      value: z.number()
    })
  )
})

type VisualizationType = z.infer<typeof VisualizationSchema>
type ReportExecutorType = z.infer<typeof ReportExecutorSchema>

const ReportExecutorSchema = z
  .object({
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string()
  })
  .required()

type DataAnalysisType = z.infer<typeof DataAnalysisSchema>

const DataAnalysisSchema = z
  .object({
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()

type ReportOutputType = z.infer<typeof ReportOutputSchema>

const ReportOutputSchema = z
  .object({
    aim: z.string(),
    introduction: z.string(),
    principle: z.string(),
    material: z.string(),
    preparation: z.string(),
    procedure: z.string(),
    setup: z.string(),
    dataAnalysis: z.string(),
    results: z.string(),
    discussion: z.string(),
    conclusion: z.string(),
    nextSteps: z.string()
  })
  .required()

// Define interfaces
interface ReportState {
  protocol: string
  paperSummary?: string
  dataFileSummary?: string
  experimentObjective?: string
  finalOutput: ReportOutputType
  chartImage?: string
  chartData: VisualizationType["data"]
  aim: string
  introduction: string
  principle: string
  material: string
  preparation: string
  procedure: string
  setup: string
  dataAnalysis: string
  results: string
  discussion: string
  conclusion: string
  nextSteps: string
}

async function callDataVisualizationAgent(
  state: ReportState
): Promise<VisualizationType["data"]> {
  const systemPrompt = `You are a skilled data visualization expert specializing in biopharma research, responsible for creating accurate and insightful visualization that illustrate key findings from experimental data. Your primary tasks include:
Reviewing the provided data files to identify relevant trends, patterns, and results that directly address the experiment's objectives.
Generating clear, scientifically rigorous visualization that present experimental results and any statistical analysis necessary to support data interpretation.
Ensuring that the visualization directly supports the narrative of the report, aligning with research objectives and helping readers understand key findings.

Constraints:
Provide the visualization data to be used to generate a chart.
`

  const userPrompt = `Generate the data in this format:
[
    { label: "Category 1", value: 25 },
    { label: "Category 2", value: 35 },
    { label: "Category 3", value: 45 }
] 
    
use the following context:

Objective: ${state.experimentObjective}
Protocol: ${state.protocol}
Data files: ${state.dataFileSummary}`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        VisualizationSchema,
        "visualizationSchema"
      )
    })
    const vizData = completion.choices[0].message.parsed!.data

    return vizData
  } catch (error) {
    console.error("Error in callDataVisualizationAgent:", error)
    throw error
  }
}

async function finalValidatorAgent(
  state: ReportState
): Promise<ReportOutputType> {
  const systemPrompt = `You are an expert at structured data extraction. You will be given unstructured text from a research report and should convert it into the given structure`

  const prompt = `
Report Draft: {reportDraft}
Data Analysis Draft: {dataAnalysisDraft}
  `

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: prompt }
      ],
      response_format: zodResponseFormat(ReportOutputSchema, "reportOutput")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in finalValidatorAgent:", error)
    throw error
  }
}

const chartTool = tool(
  async ({ data }) => {
    const width = 800 // Increased width for better spacing
    const height = 500
    const margin = { top: 30, right: 50, bottom: 120, left: 60 } // Increased bottom margin for rotated labels

    // Create a canvas
    const canvas = createCanvas(width, height)
    const ctx = canvas.getContext("2d")

    // Fill the background
    ctx.fillStyle = "#f8f9fa"
    ctx.fillRect(0, 0, width, height)

    const x = d3
      .scaleBand()
      .domain(data.map(d => d.label))
      .range([margin.left, width - margin.right])
      .padding(0.3) // Increased padding between bars

    const y = d3
      .scaleLinear()
      .domain([0, (d3.max(data, (d: any) => d.value) || 0) * 1.1])
      .nice()
      .range([height - margin.bottom, margin.top])

    const colorPalette = [
      "#e6194B",
      "#3cb44b",
      "#ffe119",
      "#4363d8",
      "#f58231",
      "#911eb4",
      "#42d4f4",
      "#f032e6",
      "#bfef45",
      "#fabebe"
    ]

    // Draw title
    ctx.font = "bold 16px Arial"
    ctx.textAlign = "center"
    ctx.fillStyle = "#333"
    ctx.fillText("Data Visualization", width / 2, margin.top / 2)

    // Draw bars with slight shadow for depth
    data.forEach((d, idx) => {
      ctx.fillStyle = colorPalette[idx % colorPalette.length]

      // Add shadow effect
      ctx.shadowColor = "rgba(0, 0, 0, 0.2)"
      ctx.shadowBlur = 5
      ctx.shadowOffsetX = 2
      ctx.shadowOffsetY = 2

      ctx.fillRect(
        x(d.label) ?? 0,
        y(d.value),
        x.bandwidth(),
        height - margin.bottom - y(d.value)
      )

      // Reset shadow
      ctx.shadowColor = "transparent"
      ctx.shadowBlur = 0
      ctx.shadowOffsetX = 0
      ctx.shadowOffsetY = 0

      // Add value label on top of each bar
      ctx.fillStyle = "#333"
      ctx.font = "12px Arial"
      ctx.textAlign = "center"
      ctx.fillText(
        d.value.toString(),
        (x(d.label) ?? 0) + x.bandwidth() / 2,
        y(d.value) - 5
      )
    })

    // Draw x-axis line
    ctx.beginPath()
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 1
    ctx.moveTo(margin.left, height - margin.bottom)
    ctx.lineTo(width - margin.right, height - margin.bottom)
    ctx.stroke()

    // Draw x-axis labels (rotated to prevent overlap)
    ctx.save()
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.font = "12px Arial"
    ctx.fillStyle = "#333"

    x.domain().forEach((d: any) => {
      const xCoord = (x(d) ?? 0) + x.bandwidth() / 2
      ctx.save()
      ctx.translate(xCoord, height - margin.bottom + 10)
      ctx.rotate(Math.PI / 4) // Rotate text 45 degrees
      ctx.fillText(d, 0, 0)
      ctx.restore()
    })

    ctx.restore()

    // Draw y-axis line
    ctx.beginPath()
    ctx.strokeStyle = "#666"
    ctx.lineWidth = 1
    ctx.moveTo(margin.left, margin.top)
    ctx.lineTo(margin.left, height - margin.bottom)
    ctx.stroke()

    // Draw y-axis labels and grid lines
    ctx.textAlign = "right"
    ctx.textBaseline = "middle"
    ctx.font = "12px Arial"
    ctx.fillStyle = "#333"

    const ticks = y.ticks(10) // More ticks for better readability
    ticks.forEach((d: any) => {
      const yCoord = y(d)

      // Draw tick
      ctx.beginPath()
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(margin.left - 6, yCoord)
      ctx.stroke()

      // Draw label
      ctx.fillText(d.toString(), margin.left - 10, yCoord)

      // Draw grid line
      ctx.beginPath()
      ctx.strokeStyle = "#e0e0e0"
      ctx.setLineDash([2, 2])
      ctx.moveTo(margin.left, yCoord)
      ctx.lineTo(width - margin.right, yCoord)
      ctx.stroke()
      ctx.setLineDash([])
    })

    // Add a light border around the chart
    ctx.strokeStyle = "#ddd"
    ctx.lineWidth = 1
    ctx.strokeRect(0, 0, width, height)

    // Convert canvas to a buffer containing a PNG image
    const buffer = canvas.toBuffer("image/png") as Buffer

    // Convert buffer to base64 string
    const base64Image = buffer.toString("base64")

    // Return the base64-encoded image
    return `data:image/png;base64,${base64Image}`
  },
  {
    name: "generate_bar_chart",
    description:
      "Generates a bar chart from an array of data points using D3.js and returns it as a base64-encoded PNG image.",
    schema: z.object({
      data: z.array(
        z.object({
          label: z.string(),
          value: z.number()
        })
      )
    })
  }
)

async function callTheoryAgent(state: ReportState): Promise<ReportTheoryType> {
  const systemPrompt = `You are an experienced senior scientist specializing in scientific theory and context writing, tasked with creating the theoretical foundation for a comprehensive research report in biopharma. Your role is to document the experiment's Aim, Introduction, and Principle in a scientifically rigorous and clear manner, providing essential context for reproducibility. Your report should be well-formatted, accurate, and convey the purpose, background, and fundamental scientific principles underpinning the experiment.Your primary tasks include writing :AimIntroductionPrincipleGuidelines for Writing these sections:
###
1. Aim (approx. 40-100 words):
Clearly state the research aim, addressing what the experiment seeks to achieve and its importance, based on the user given objective. Outline the main objectives of the experiment and link them back to the user-provided context.Example Aim Statement: "The aim of this experiment is to evaluate the viscosity of a high-concentration antibody (antibody name) solution under different formulation conditions to identify optimal parameters for manufacturing and administration.

2. Introduction (approx. 100-300 words):
Provide background information, summarizing the scientific context and rationale, referencing any user-provided protocols. Address the significance of the experiment within the field of biopharma research.Example Introduction Statement: "High viscosity in high-concentration antibody formulations poses significant challenges for drug delivery, particularly for subcutaneous injections, where high viscosity can impede syringeability and injectability, affecting patient comfort and dosing precision. As biopharmaceuticals increasingly move towards self-administered, high-dose formats, managing viscosity has become essential. To address these issues, formulation scientists often use excipients, such as sugars, amino acids, and surfactants, to reduce protein-protein interactions, as well as adjustments in pH and ionic strength. The capillary viscometer, an effective tool for measuring viscosity across a wide range, is frequently used to evaluate these formulations, providing crucial insights into viscosity under different formulation conditions. Understanding and controlling viscosity is vital for developing stable, patient-friendly formulations that ensure both effective delivery and therapeutic efficacy."

3. Principle (approx. 100-150 words):
Explain the fundamental principles behind the experiment and technique used. Describe the scientific theory and mechanisms that underpin the methodology, connecting them with the research objectives. Use this information from the protocol given by the user. Attach image if available in the protocol.Example Principle Statement: Principle of the Malvern Capillary Viscometer.
The capillary viscometer measures the viscosity of fluids by assessing the flow rate through a thin capillary tube under a controlled pressure difference. This method relies on Poiseuille's law, which describes the relationship between flow rate, pressure, and viscosity for Newtonian fluids. According to Poiseuille's equation:
η=ΔP⋅r4/8⋅Q⋅L

where:
η is the viscosity,
ΔP is the pressure drop across the capillary,
r is the radius of the capillary,
Q is the volumetric flow rate, and
L is the length of the capillary.
In practice, the instrument applies a known pressure, and the time taken for a specific volume of fluid to pass through the capillary is recorded. The viscometer automatically adjusts parameters to accommodate a wide viscosity range, allowing accurate viscosity measurements across various formulation conditions. This precision and adaptability make the capillary viscometer a reliable choice for analyzing high-viscosity biopharmaceutical formulations, enabling researchers to optimize conditions for stability and usability.

###
Constraints:
Focus solely on theory-based sections; do not include procedural details, materials, or data analysis.
Maintain a scientific, objective tone throughout.
Ensure each section is concise or elaborate as guided in indvidual sections, accurate, and aligned with the provided objective.
`

  const userPrompt = `Generate aim, introduction, and principle using the following:

Objective: ${state.experimentObjective}
Protocol: ${state.protocol}
Data files: ${state.dataFileSummary}`

  console.log("userPrompt: " + userPrompt)

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(ReportTheorySchema, "reportTheory")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in reportTheoryAgent:", error)
    throw error
  }
}

async function callDataAnalystAgent(
  state: ReportState
): Promise<DataAnalysisType> {
  const systemPrompt = `You are an expert data analyst and senior scientist tasked with documenting data-driven sections for a comprehensive biopharma research report. Your role is to interpret the data files based on the defined objective and present the Data Analysis, Results, Discussion, Conclusions, and Next Steps based on the experiment findings, offering clear insights and actionable recommendations.
Your primary tasks include writing (as per individual instructions):
Data analysis
Results
Discussion
Conclusion
Next steps

1. Data Analysis (approx. 100-1000 words)Summarize the approach to analyzing data, including any specific parameters, controls, and statistical tests.
Reference any software or tools used for data analysis. Extract this information from the data analysis section of protocol and also go through the data files uploaded by the user to look at the final processed data to include the final data in this section.
Present the final data in a well-formatted form that is easy to understand. Add any images from the data files, if present.
Add the visualizations prepared by visualization agent and add here after the text data.

Example Analysis Statement: 
Data Analysis
The viscosity of each sample was analyzed using the Malvern Viscosizer software, which calculated viscosity values based on flow rates through the capillary under controlled conditions. Key analysis parameters included temperature control at 25°C and flow consistency across all samples. Statistical comparisons were conducted to evaluate the impact of antibody concentration on viscosity.
Parameters and Controls
Temperature: 25°C, controlled via the built-in thermostat.
Control Sample: Phosphate-Buffered Saline (PBS) served as the baseline control for comparison.
Software: Malvern Viscosizer software, version 2.1,

Summary
The final processed data for each sample, including the viscosity values (in mPa·s) at 25°C, are presented in the table below. Each measurement was averaged from three replicate readings.

Data Interpretation
The analysis shows a progressive increase in viscosity with higher antibody concentrations. The PBS buffer served as a baseline control, showing minimal viscosity under experimental conditions.

2. Results (approx. 50-150 words, plus visuals)Present key findings, referencing visualizations (given by the visualization agent) where appropriate. Summarize data trends and major observations without interpretation (interpretation will be in the Discussion section).Example Results Statement: Results
The viscosity measurements for antibody formulations at varying concentrations were collected at 25°C. Key findings are summarized in the table and visualization below. The results show a clear trend of increasing viscosity with higher antibody concentrations. The PBS buffer, serving as a control, maintained a low baseline viscosity (1.10 mPa·s), while antibody solutions at 50 mg/mL, 100 mg/mL, and 200 mg/mL exhibited viscosities of 1.85, 3.60, and 6.45 mPa·s, respectively. This progression indicates a concentration-dependent rise in viscosity, with the highest concentration (200 mg/mL) showing a significantly elevated viscosity.
Refer to Figure 1 for a graphical representation of viscosity values across all concentrations, with error bars indicating standard deviations.

3. Discussion (approx. 50-100 words)Interpret the findings in relation to the experiment objectives. Discuss potential implications, limitations, and relevance to the field.
Example Discussion Statement: The results indicate a clear increase in viscosity with rising antibody concentrations, highlighting challenges in formulating high-dose, injectable biologics. This concentration-dependent viscosity likely results from intensified protein-protein interactions, which can complicate syringeability for subcutaneous administration. These findings suggest the need for strategies, such as excipient addition or buffer optimization, to manage viscosity and improve patient compliance.
While valuable, this study is limited to specific antibody concentrations and buffer conditions; future work could expand to test additional excipients and pH levels. Overall, this research emphasizes the importance of viscosity control in developing patient-friendly, high-concentration antibody therapies.

4. Conclusion (approx. 30-70 words)Summarize the main findings of the presented study in concise clear language.Example Conclusion Statement:This study demonstrates a concentration-dependent increase in viscosity for high-concentration antibody formulations, underscoring challenges in injectable biologics. 

5. Next Steps (approx. 50-100 words)
Suggest next steps for further research or applications based on the research findings and study objectives.
Example Next steps Statement:
Future research should explore excipient options and alternative buffers to mitigate viscosity, enhancing formulation stability and patient usability for high-dose therapeutics.

Constraints:
Focus solely on data analysis, interpretation and conclusion; do not add theory or procedural details.
Maintain scientific rigor, ensuring that findings are presented clearly, concisely, and without bias.
Ensure each section directly addresses the experiment's objectives and supports actionable insights.
`

  const userPrompt = `To generate the content, refer to the following:
Objective: ${state.experimentObjective}
Data Files: ${state.dataFileSummary}
Protocol: ${state.protocol}`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(DataAnalysisSchema, "dataAnalysis")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in DataAnalysisAgent:", error)
    throw error
  }
}

async function callExecutorAgent(
  state: ReportState
): Promise<ReportExecutorType> {
  const systemPrompt = `You are a seasoned scientist with expertise in experimental design and execution, tasked with documenting the practical aspects of a an experiment in a comprehensive research report. Your focus is on Materials Needed, Preparation, Procedure, Experiment Setup and Layout for a biopharma experiment, ensuring clarity, detailed description of every step and reproducibility for hands-on execution. Write the sections in past tense, as how things were done to run the experiment.Your primary tasks include writing :

1. Material needed
2. Preparation
3. Procedure
4. Setup and layout

Guidelines for Writing these sections:

1. Material needed (approx. 150-200 words)List all materials used in the experiment, including consumables, equipment, and reagents, buffers, controls and standard solutions along with their specifications. Find this information from the protocol - material needed section attached by the user and refer to the preparation files uploaded by the user to find any specific information on the amount of material used.Example Materials Statement: Materials Required
Consumables
Sample Vials: 1.5 mL sterile vials 
Pipette Tips: Low-retention tips (10 µL, 100 µL, and 1000 µL) 
Syringe Filters: 0.22 µm filters for sample filtration to remove particulate matter.
Equipment
Malvern Capillary Viscometer 
Thermostatic Water Bath
Analytical Balance

Reagents, Buffers, and Standards
Antibody Solution: High-concentration antibody solution at varying test concentrations (e.g., 50 mg/mL, 100 mg/mL, 200 mg/mL).
Buffer Solution: Phosphate-buffered saline (PBS) at pH 7.4, used for diluting the antibody solution.
Viscosity Standard Solution: glycerol solution at 10%, 30%, 50%, 70% (v/v) for instrument calibration.
IPA - Isopropyl alcohol - for cleaning 
DI water - for cleaning


2. Preparation (approx. 200-600 words)
Detail any preparation instructions or steps required before starting the experiment - including instrument setup, solution, buffer, reagent preparation along with calculations, needed for accuracy.Use this information from the preparation files given by the user. It should include how much of the solutions were prepared and how. Use protocol (materials and preparation section) for finding any background information on the materials and preparation, if you need further help in writing it.

Example Preparation statement:
Instrument Setup
Calibrate the Viscometer: Use the viscosity standard solution to verify instrument accuracy at the target temperature. Run a cleaning cycle with IPA and deionized water before measurements.
Buffer Preparation 
Phosphate-Buffered Saline (PBS), pH 7.4:
Prepare 1 L of PBS by dissolving 8 g of NaCl, 0.2 g of KCl, 1.44 g of Na₂HPO₄, and 0.24 g of KH₂PO₄ in deionized water.
Adjust the pH to 7.4 with NaOH or HCl if needed.
Dilute to a final volume of 1 L with deionized water and mix thoroughly.


3. Procedure (approx. 300-1000 words)
Provide step-by-step instructions for running the experiment. Ensure that all the steps are captured (big or small) and each step is detailed to allow for reproducibility by reading this section. Refer to the protocol procedure section for this and also check for any relevant additional information provided in the other documents uploaded. Write it as how it was performed, Example Procedure Statement: - Prepare the Instrument
Turn on the Malvern Capillary Viscometer and allow it to initialize. Check that all components, including the capillary and sample holder, are clean and dry.

Installation of Capillary -
Select the Appropriate Capillary
Choose a capillary tube suitable for the expected viscosity range of the samples. As per the user manual, capillary XX1232, 15.6 cm long was used for high-concentration antibody solutions.
Inspect the Capillary
Before installation, inspect the capillary tube for any visible defects, such as cracks or clogs. Ensure the capillary is clean and free of any residual material from previous use. If necessary, clean the capillary with isopropyl alcohol (IPA) followed by a rinse with deionized water, then allow it to dry completely.
Install the Capillary in the Viscometer
Carefully insert the capillary tube into the designated holder within the viscometer. Align the tube to prevent bending or damage. Secure it in place according to the viscometer's specifications, ensuring that it is properly seated and locked.…..

4. Setup (approx. 50-300 words)
Describe the experimental layout, including sample arrangements, vial positioning, sample or solution labeling and any specific configurations necessary for accurate data labeling, analysis and results. Check for this information from preparation document and  in other documents uploaded, if any. Add a diagram if available in the uploaded preparation file.


Constraints:
Focus exclusively on practical, preparatioin  and procedural details; do not provide theoretical context or interpret data.
Ensure clear, detailed instructions that support reproducibility.
Organize the information logically and with attention to accuracy.
`

  const userPrompt = `Generate material, preparation, procedure, and setup using the following:
Objective: ${state.experimentObjective}
Protocol: ${state.protocol}
Data Files: ${state.dataFileSummary}
`

  try {
    const completion = await openai().beta.chat.completions.parse({
      model: MODEL_NAME(),
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(ReportExecutorSchema, "reportTheory")
    })
    const reportOutput = completion.choices[0].message.parsed!

    return reportOutput
  } catch (error) {
    console.error("Error in reportTheoryAgent:", error)
    throw error
  }
}

// Define the workflow
const workflow = new StateGraph<ReportState>({
  channels: {
    aim: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    introduction: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    principle: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    material: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    preparation: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    procedure: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    setup: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    dataAnalysis: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    results: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    discussion: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    conclusion: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    nextSteps: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    protocol: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    paperSummary: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    dataFileSummary: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    finalOutput: {
      value: (left?: ReportOutputType, right?: ReportOutputType) =>
        right ?? left ?? ({} as ReportOutputType),
      default: () => ({}) as ReportOutputType
    },
    chartData: {
      value: (
        left?: VisualizationType["data"],
        right?: VisualizationType["data"]
      ) => right ?? left ?? ({} as VisualizationType["data"]),
      default: () => ({}) as VisualizationType["data"]
    },
    chartImage: {
      // Added chartImage channel
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    }
  }
})

  .addNode("reportWriterTheoryAgent", async (state: ReportState) => {
    try {
      const finalOutput = await callTheoryAgent(state)
      return {
        ...state,
        aim: finalOutput.aim,
        principle: finalOutput.principle,
        introduction: finalOutput.introduction
      }
    } catch (error) {
      console.error("Error in finalValidatorAgent:", error)
      throw error
    }
  })
  .addNode("reportWriterExecutorAgent", async (state: ReportState) => {
    try {
      const finalOutput = await callExecutorAgent(state)
      return {
        ...state,
        material: finalOutput.material,
        preparation: finalOutput.preparation,
        procedure: finalOutput.procedure,
        setup: finalOutput.setup
      }
    } catch (error) {
      console.error("Error in reportWriterExecutorAgent:", error)
      throw error
    }
  })
  .addNode("dataVisualizationAgent", async (state: ReportState) => {
    try {
      const content = await callDataVisualizationAgent(state)

      return { ...state, chartData: content }
    } catch (error) {
      console.error("Error in dataVisualizationAgent:", error)
      throw error
    }
  })

  .addNode("dataAnalystAgent", async (state: ReportState) => {
    try {
      const finalOutput = await callDataAnalystAgent(state)
      return {
        ...state,
        dataAnalysis: finalOutput.dataAnalysis,
        results: finalOutput.results,
        discussion: finalOutput.discussion,
        conclusion: finalOutput.conclusion,
        nextSteps: finalOutput.nextSteps
      }
    } catch (error) {
      console.error("Error in reportWriterExecutorAgent:", error)
      throw error
    }
  })
  .addNode("generateChart", async (state: ReportState) => {
    try {
      // Parse data from dataFileSummary
      const parsedData = state.chartData
      const chartImage = await chartTool.func({ data: parsedData })
      return { ...state, chartImage }
    } catch (error) {
      console.error("Error in generateChart:", error)
      throw error
    }
  })
  // .addNode("finalValidatorAgent", async (state: ReportState) => {
  //   try {
  //     const finalOutput = await finalValidatorAgent(state)
  //     return { ...state, finalOutput }
  //   } catch (error) {
  //     console.error("Error in finalValidatorAgent:", error)
  //     throw error
  //   }
  // })
  .addEdge(START, "reportWriterTheoryAgent")
  .addEdge("reportWriterTheoryAgent", "reportWriterExecutorAgent")
  .addEdge("reportWriterExecutorAgent", "dataVisualizationAgent") // Add this edge
  .addEdge("dataVisualizationAgent", "dataAnalystAgent") // Add this edge
  .addEdge("dataAnalystAgent", "generateChart")
  .addEdge("generateChart", END)

// Helper function to parse data
function parseDataFromSummary(
  summary: string
): { label: string; value: number }[] {
  // Implement your logic to parse data from summary
  // For demonstration, returning dummy data
  return [
    { label: "Parsed Category 1", value: 25 },
    { label: "Parsed Category 2", value: 35 },
    { label: "Parsed Category 3", value: 45 }
  ]
}

// Compile the graph

export async function POST(req: Request) {
  try {
    const { protocol, papers, dataFiles, experimentObjective } =
      (await req.json()) as {
        protocol?: string[]
        papers?: string[]
        dataFiles?: string[]
        experimentObjective?: string
      }

    const protocolIds = Array.isArray(protocol) ? protocol : []
    const paperIds = Array.isArray(papers) ? papers : []
    const dataFileIds = Array.isArray(dataFiles) ? dataFiles : []

    const protocolContent = await retrieveFileContent(protocolIds)
    const paperContent = await retrieveFileContent(paperIds)
    const dataFileContent = await retrieveFileContent(dataFileIds)

    console.log("protocolContent: " + JSON.stringify(protocolContent)) // Add this log
    console.log("paperContent: " + JSON.stringify(paperContent)) // Add this log
    console.log("dataFileContent: " + JSON.stringify(dataFileContent)) // Add this log

    const initialState: ReportState = {
      aim: "",
      introduction: "",
      principle: "",
      material: "",
      preparation: "",
      procedure: "",
      setup: "",
      dataAnalysis: "",
      results: "",
      discussion: "",
      conclusion: "",
      nextSteps: "",
      experimentObjective: experimentObjective || "",
      protocol: protocolContent[0]?.content || "",
      paperSummary: paperContent[0]?.content || "",
      dataFileSummary: dataFileContent[0]?.content || "",
      finalOutput: {} as ReportOutputType,
      chartData: [] as VisualizationType["data"],
      chartImage: "" // Initialize chartImage
    }

    let finalState: ReportState | undefined

    for await (const event of await app.stream(initialState)) {
      for (const [key, value] of Object.entries(event)) {
        finalState = value as ReportState
        // console.log(`Updated state for ${key}:`, finalState)
      }
    }

    if (finalState) {
      console.log("Final state:", finalState)
      return NextResponse.json({
        reportOutline: [
          "aim",
          "introduction",
          "principle",
          "material",
          "preparation",
          "procedure",
          "setup",
          "dataAnalysis",
          "charts",
          "results",
          "discussion",
          "conclusion",
          "nextSteps"
        ],
        reportDraft: {
          aim: finalState.aim,
          introduction: finalState.introduction,
          principle: finalState.principle,
          material: finalState.material,
          preparation: finalState.preparation,
          procedure: finalState.procedure,
          setup: finalState.setup,
          dataAnalysis: finalState.dataAnalysis,
          charts: finalState.chartImage,
          results: finalState.results,
          discussion: finalState.discussion,
          conclusion: finalState.conclusion,
          nextSteps: finalState.nextSteps
        },
        chartImage: finalState.chartImage // Include chartImage in response
      })
    }

    return new NextResponse("Failed to generate report", { status: 500 })
  } catch (error) {
    console.error("[REPORT_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

const app = workflow.compile()

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
