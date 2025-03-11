import { StateGraph, END, START } from "@langchain/langgraph"
import OpenAI from "openai"
import { zodResponseFormat } from "openai/helpers/zod"
import { z } from "zod"
import { SERPGoogleScholarAPITool } from "@langchain/community/tools/google_scholar"

import { NextResponse } from "next/server"

// Add model constant
const MODEL_NAME = "gpt-4o-2024-08-06"

process.env.GOOGLE_SCHOLAR_API_KEY = process.env.SERPAPI_API_KEY

const scholarTool = new SERPGoogleScholarAPITool({
  apiKey: process.env.SERPAPI_API_KEY
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
})

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

type ExperimentDesignState = {
  problem: string
  objectives: string[]
  variables: string[]
  specialConsiderations: string[]
  literatureFindings: {
    papers: Array<{
      title: string
      summary: string
      relevance: string
      methodology: string
      pitfalls: string[]
    }>
  }
  dataAnalysis: {
    correlations: string[]
    outliers: string[]
    keyFindings: string[]
    metrics: string[]
  }
  experimentDesign: {
    hypothesis: string
    factors: Array<{
      name: string
      levels: string[]
    }>
    randomization: string
    statisticalPlan: {
      methods: string[]
      significance: string
    }
  }
  finalReport: {
    introduction: string
    literatureSummary: string
    dataInsights: string
    hypothesis: string
    designOfExperiments: string
    statisticalAnalysis: string
    recommendations: string
  }
}

type ExperimentDesignUpdate = Partial<ExperimentDesignState> & {
  userData: any
}

const ExperimentDesignSchema = z
  .object({
    problem: z.string(),
    objectives: z.array(z.string()),
    variables: z.array(z.string()),
    specialConsiderations: z.array(z.string()),
    literatureFindings: z.object({
      papers: z.array(
        z.object({
          title: z.string(),
          summary: z.string(),
          relevance: z.string(),
          methodology: z.string(),
          pitfalls: z.array(z.string())
        })
      )
    }),
    dataAnalysis: z.object({
      correlations: z.array(z.string()),
      outliers: z.array(z.string()),
      keyFindings: z.array(z.string()),
      metrics: z.array(z.string())
    }),
    experimentDesign: z.object({
      hypothesis: z.string(),
      factors: z.array(
        z.object({
          name: z.string(),
          levels: z.array(z.string())
        })
      ),
      randomization: z.string(),
      statisticalPlan: z.object({
        methods: z.array(z.string()),
        significance: z.string()
      })
    }),
    finalReport: z.object({
      introduction: z.string(),
      literatureSummary: z.string(),
      dataInsights: z.string(),
      hypothesis: z.string(),
      designOfExperiments: z.string(),
      statisticalAnalysis: z.string(),
      recommendations: z.string()
    })
  })
  .required()

// Define interfaces
interface DesignState {
  problem?: string
  finalOutput: ReportOutputType
  hypothesis: string
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

async function callScholarAgent(state: DesignState): Promise<ReportTheoryType> {
  const results = await scholarTool.invoke({
    query: state.problem,
    maxResults: 10
  })

  return results
}

async function callTheoryAgent(state: DesignState): Promise<ReportTheoryType> {
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

Objective: ${state.problem}`

  console.log("userPrompt: " + userPrompt)

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
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

async function callExecutorAgent(
  state: DesignState
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
Objective: ${state.problem}
`

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
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

function createState(
  state: ExperimentDesignState,
  updates: Partial<ExperimentDesignState>
) {
  const newState = {
    problem: state.problem,
    objectives: state.objectives,
    variables: state.variables,
    specialConsiderations: state.specialConsiderations,
    literatureFindings: updates.literatureFindings ?? state.literatureFindings,
    dataAnalysis: updates.dataAnalysis ?? state.dataAnalysis,
    experimentDesign: updates.experimentDesign ?? state.experimentDesign,
    finalReport: updates.finalReport ?? state.finalReport
  }
  return newState as unknown as ExperimentDesignState
}

// Define the workflow
const workflow = new StateGraph<ExperimentDesignState>({
  channels: {
    problem: {
      value: (left?: string, right?: string) => right ?? left ?? "",
      default: () => ""
    },
    objectives: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    variables: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    specialConsiderations: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    literatureFindings: {
      value: (left?: any, right?: any) => right ?? left ?? { papers: [] },
      default: () => ({ papers: [] })
    },
    dataAnalysis: {
      value: (left?: any, right?: any) =>
        right ??
        left ?? {
          correlations: [],
          outliers: [],
          keyFindings: [],
          metrics: []
        },
      default: () => ({
        correlations: [],
        outliers: [],
        keyFindings: [],
        metrics: []
      })
    },
    experimentDesign: {
      value: (left?: any, right?: any) =>
        right ??
        left ?? {
          hypothesis: "",
          factors: [],
          randomization: "",
          statisticalPlan: {
            methods: [],
            significance: ""
          }
        },
      default: () => ({
        hypothesis: "",
        factors: [],
        randomization: "",
        statisticalPlan: {
          methods: [],
          significance: ""
        }
      })
    },
    finalReport: {
      value: (left?: any, right?: any) =>
        right ??
        left ?? {
          introduction: "",
          literatureSummary: "",
          dataInsights: "",
          hypothesis: "",
          designOfExperiments: "",
          statisticalAnalysis: "",
          recommendations: ""
        },
      default: () => ({
        introduction: "",
        literatureSummary: "",
        dataInsights: "",
        hypothesis: "",
        designOfExperiments: "",
        statisticalAnalysis: "",
        recommendations: ""
      })
    }
  }
})
  .addNode("plannerAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running plannerAgent node")
      const result = await callPlannerAgent(state)
      console.log("✅ [WORKFLOW] plannerAgent node completed")
      return {
        ...state,
        experimentDesign: result.experimentDesign
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in plannerAgent node:", error)
      throw error
    }
  })
  .addNode("literatureResearchAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running literatureResearchAgent node")
      const result = await callLiteratureResearchAgent(state)
      console.log("✅ [WORKFLOW] literatureResearchAgent node completed")
      return {
        ...state,
        literatureFindings: result.literatureFindings
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error(
        "❌ [WORKFLOW] Error in literatureResearchAgent node:",
        error
      )
      throw error
    }
  })
  .addNode("dataAnalyzerAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running dataAnalyzerAgent node")
      const result = await callDataAnalyzerAgent(state)
      console.log("✅ [WORKFLOW] dataAnalyzerAgent node completed")
      return {
        ...state,
        dataAnalysis: result.dataAnalysis
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in dataAnalyzerAgent node:", error)
      throw error
    }
  })
  .addNode("doeAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running doeAgent node")
      const result = await callDOEAgent(state)
      console.log("✅ [WORKFLOW] doeAgent node completed")
      return {
        ...state,
        experimentDesign: result.experimentDesign
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in doeAgent node:", error)
      throw error
    }
  })
  .addNode("reportWriterAgent", async (state: ExperimentDesignState) => {
    try {
      console.log("⚙️ [WORKFLOW] Running reportWriterAgent node")
      const result = await callReportWriterAgent(state)
      console.log("✅ [WORKFLOW] reportWriterAgent node completed")
      return {
        ...state,
        finalReport: result.finalReport
      } satisfies ExperimentDesignState
    } catch (error) {
      console.error("❌ [WORKFLOW] Error in reportWriterAgent node:", error)
      throw error
    }
  })
  .addEdge(START, "plannerAgent")
  .addEdge("plannerAgent", "literatureResearchAgent")
  .addEdge("literatureResearchAgent", "dataAnalyzerAgent")
  .addEdge("dataAnalyzerAgent", "doeAgent")
  .addEdge("doeAgent", "reportWriterAgent")
  .addEdge("reportWriterAgent", END)

export async function POST(req: Request) {
  console.log("\n🚀 [DESIGN_DRAFT] Request received")

  try {
    const requestData = await req.json()
    console.log(
      "📥 [DESIGN_DRAFT] Request data:",
      JSON.stringify(requestData, null, 2)
    )

    const { problem, objectives, variables, specialConsiderations } =
      requestData

    console.log("🔧 [DESIGN_DRAFT] Creating initial state")
    const initialState: ExperimentDesignState = {
      problem: problem || "",
      objectives: objectives || [],
      variables: variables || [],
      specialConsiderations: specialConsiderations || [],
      literatureFindings: { papers: [] },
      dataAnalysis: {
        correlations: [],
        outliers: [],
        keyFindings: [],
        metrics: []
      },
      experimentDesign: {
        hypothesis: "",
        factors: [],
        randomization: "",
        statisticalPlan: {
          methods: [],
          significance: ""
        }
      },
      finalReport: {
        introduction: "",
        literatureSummary: "",
        dataInsights: "",
        hypothesis: "",
        designOfExperiments: "",
        statisticalAnalysis: "",
        recommendations: ""
      }
    }

    console.log("🔄 [DESIGN_DRAFT] Starting workflow execution")
    let finalState: ExperimentDesignState | undefined

    return NextResponse.json({
      experimentDesign: {
        hypothesis:
          "The novel treatment is expected to show increased efficacy and acceptable safety profile at optimized dosage levels compared to current standards.",
        factors: [
          {
            name: "Dosage levels",
            levels: ["Low", "Medium", "High"]
          },
          {
            name: "Patient age groups",
            levels: ["18-30", "31-50", "51-70"]
          },
          {
            name: "Genetic marker presence",
            levels: ["Present", "Absent"]
          }
        ],
        randomization:
          "Use a stratified randomization process to ensure balanced subgroups across age and genetic factors.",
        statisticalPlan: {
          methods: [
            "ANOVA for dosage level comparison",
            "Regression analysis for pharmacokinetics",
            "Chi-square tests for adverse event rates"
          ],
          significance:
            "A p-value of less than 0.05 will be considered statistically significant."
        }
      },
      finalReport: {
        introduction:
          "This study aims to evaluate a novel treatment for enhanced efficacy and safety across diverse patient subgroups defined by dosage, age, and genetic markers. This represents a critical step toward personalized medicine.",
        literatureSummary:
          "Current literature underscores the complexity of demonstrating treatment efficacy and safety across heterogeneous populations. Insights from genetic and age-related variability studies are leveraged to inform the experimental design, particularly concerning stratification and subgroup analysis.",
        dataInsights:
          "Analyses will focus on correlations between genetic markers, dosage levels, and treatment efficacy. Monitoring outliers and considering subgroup variability will refine safety profiling and optimize dosage recommendations.",
        hypothesis:
          "The novel treatment is expected to show increased efficacy and acceptable safety profile at optimized dosage levels compared to current standards.",
        designOfExperiments:
          "A stratified randomization process will ensure balanced representation across patient subgroups by dosage, age groups, and genetic marker presence. This design will facilitate robust comparative analysis and personalized treatment insights.",
        statisticalAnalysis:
          "Analyses will apply ANOVA for dosage comparisons, regression for pharmacokinetic profiling, and Chi-square tests to evaluate adverse event rates, with significance established at p<0.05.",
        recommendations:
          "Implement stratified randomization to mitigate subgroup bias and focus on refining genetic component analysis to enhance the predictability of treatment outcomes, thus advancing personalized treatment strategies."
      }
    })

    // try {
    //   for await (const event of await app.stream(initialState)) {
    //     for (const [key, value] of Object.entries(event)) {
    //       console.log(`✅ [DESIGN_DRAFT] Completed node: ${key}`)
    //       finalState = value as ExperimentDesignState
    //     }
    //   }
    // } catch (error) {
    //   console.error("❌ [DESIGN_DRAFT] Error in workflow execution:", error)
    //   throw error
    // }

    // if (finalState) {
    //   console.log("🏁 [DESIGN_DRAFT] Workflow completed successfully")
    //   console.log("📤 [DESIGN_DRAFT] Returning response data")

    //   return NextResponse.json({
    //     experimentDesign: finalState.experimentDesign,
    //     finalReport: finalState.finalReport
    //   })
    // }

    // console.error("❌ [DESIGN_DRAFT] No final state produced")
    // return new NextResponse("Failed to generate experiment design", {
    //   status: 500
    // })
  } catch (error) {
    console.error("❌ [DESIGN_DRAFT_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

const app = workflow.compile()

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}

async function callPlannerAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("🔍 [PLANNER_AGENT] Starting...")
  const systemPrompt = `You are an experiment design and planning assistant for biopharma research. Your task is to understand the research problem and key initial parameters needed for coming up with an experiment design. Ensure that your suggestions are comprehensive and easy to follow for further processing.`

  const userPrompt = `Research Problem: ${state.problem}
Initial Parameters:
- Objectives: ${state.objectives.join("\n")}
- Variables: ${state.variables.join("\n")}
- Special Considerations: ${state.specialConsiderations.join("\n")}`

  try {
    console.log("📝 [PLANNER_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [PLANNER_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [PLANNER_AGENT] Error:", error)
    throw error
  }
}

async function callLiteratureResearchAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("📚 [LITERATURE_AGENT] Starting...")
  const systemPrompt = `You are a research scientist specializing in biopharma literature reviews. Your task is to analyze potential relevant research papers related to the given experiment problem and initial parameters. For each paper, provide a summary, relevance to the current research, key methodology insights, and potential pitfalls to avoid.`

  try {
    console.log("📝 [LITERATURE_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [LITERATURE_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [LITERATURE_AGENT] Error:", error)
    throw error
  }
}

async function callDataAnalyzerAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("📊 [DATA_ANALYZER_AGENT] Starting...")
  const systemPrompt = `You are an expert in data analysis for biopharma research. Analyze the provided data in relation to the research problem and initial experiment parameters. Identify correlations, outliers, key findings and insights. Extract relevant metrics that could influence experimental design choices.`

  try {
    console.log("📝 [DATA_ANALYZER_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [DATA_ANALYZER_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [DATA_ANALYZER_AGENT] Error:", error)
    throw error
  }
}

async function callDOEAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("🧪 [DOE_AGENT] Starting...")
  const systemPrompt = `You are a DOE and statistical analysis expert for biopharma. Based on the literature review, user data analysis, and initial parameters, generate a hypothesis for the experiment. Design a suitable DOE approach to test this hypothesis, clearly defining the experimental factors, levels, and any randomization techniques you propose.`

  try {
    console.log("📝 [DOE_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [DOE_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [DOE_AGENT] Error:", error)
    throw error
  }
}

async function callReportWriterAgent(
  state: ExperimentDesignState
): Promise<ExperimentDesignState> {
  console.log("📝 [REPORT_WRITER_AGENT] Starting...")
  const systemPrompt = `You are a report writer summarizing an experimental design for biopharma research. Create a comprehensive report that includes: Introduction (including objectives), Literature Summary, Hypothesis, Design of Experiments, Statistical Analysis Plan, and Recommendations.`

  try {
    console.log("📝 [REPORT_WRITER_AGENT] Sending prompt to model")
    const completion = await openai.beta.chat.completions.parse({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: JSON.stringify(state) }
      ],
      response_format: zodResponseFormat(
        ExperimentDesignSchema,
        "experimentDesign"
      )
    })
    console.log("✅ [REPORT_WRITER_AGENT] Successfully received response")
    return completion.choices[0].message.parsed!
  } catch (error) {
    console.error("❌ [REPORT_WRITER_AGENT] Error:", error)
    throw error
  }
}
