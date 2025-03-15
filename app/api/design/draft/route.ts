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

    // return NextResponse.json({
    //   experimentDesign: {
    //     hypothesis:
    //       "The novel treatment is expected to show increased efficacy and acceptable safety profile at optimized dosage levels compared to current standards.",
    //     factors: [
    //       {
    //         name: "Dosage levels",
    //         levels: ["Low", "Medium", "High"]
    //       },
    //       {
    //         name: "Patient age groups",
    //         levels: ["18-30", "31-50", "51-70"]
    //       },
    //       {
    //         name: "Genetic marker presence",
    //         levels: ["Present", "Absent"]
    //       }
    //     ],
    //     randomization:
    //       "Use a stratified randomization process to ensure balanced subgroups across age and genetic factors.",
    //     statisticalPlan: {
    //       methods: [
    //         "ANOVA for dosage level comparison",
    //         "Regression analysis for pharmacokinetics",
    //         "Chi-square tests for adverse event rates"
    //       ],
    //       significance:
    //         "A p-value of less than 0.05 will be considered statistically significant."
    //     }
    //   },
    //   finalReport: {
    //     introduction:
    //       "This study aims to evaluate a novel treatment for enhanced efficacy and safety across diverse patient subgroups defined by dosage, age, and genetic markers. This represents a critical step toward personalized medicine.",
    //     literatureSummary:
    //       "Current literature underscores the complexity of demonstrating treatment efficacy and safety across heterogeneous populations. Insights from genetic and age-related variability studies are leveraged to inform the experimental design, particularly concerning stratification and subgroup analysis.",
    //     dataInsights:
    //       "Analyses will focus on correlations between genetic markers, dosage levels, and treatment efficacy. Monitoring outliers and considering subgroup variability will refine safety profiling and optimize dosage recommendations.",
    //     hypothesis:
    //       "The novel treatment is expected to show increased efficacy and acceptable safety profile at optimized dosage levels compared to current standards.",
    //     designOfExperiments:
    //       "A stratified randomization process will ensure balanced representation across patient subgroups by dosage, age groups, and genetic marker presence. This design will facilitate robust comparative analysis and personalized treatment insights.",
    //     statisticalAnalysis:
    //       "Analyses will apply ANOVA for dosage comparisons, regression for pharmacokinetic profiling, and Chi-square tests to evaluate adverse event rates, with significance established at p<0.05.",
    //     recommendations:
    //       "Implement stratified randomization to mitigate subgroup bias and focus on refining genetic component analysis to enhance the predictability of treatment outcomes, thus advancing personalized treatment strategies."
    //   }
    // })

    try {
      for await (const event of await app.stream(initialState)) {
        for (const [key, value] of Object.entries(event)) {
          console.log(`✅ [DESIGN_DRAFT] Completed node: ${key}`)
          finalState = value as ExperimentDesignState
        }
      }
    } catch (error) {
      console.error("❌ [DESIGN_DRAFT] Error in workflow execution:", error)
      throw error
    }

    if (finalState) {
      console.log("🏁 [DESIGN_DRAFT] Workflow completed successfully")
      console.log("📤 [DESIGN_DRAFT] Returning response data")

      return NextResponse.json({
        experimentDesign: finalState.experimentDesign,
        finalReport: finalState.finalReport
      })
    }

    console.error("❌ [DESIGN_DRAFT] No final state produced")
    return new NextResponse("Failed to generate experiment design", {
      status: 500
    })
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
  const systemPrompt = `You are an experiment design and planning assistant for biopharma research. 
  Your task is to understand the research problem and key initial parameters needed for coming up with an experiment design. 
  Ensure that your suggestions are comprehensive and easy to follow for further processing.`

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
  const systemPrompt = `You are an experienced senior scientist and literature researcher specializing in biopharma experiments. Your role is to assist in crafting a robust experiment design by conducting a targeted literature review. By saving the user time, you provide a comprehensive summary of relevant findings from credible online sources that guide the design process for solving the given research problem.
Your primary responsibilities include:
Understanding the Experiment Parameters:
Review the user-provided objective, key variables, and constraints.
Use this information to focus your literature search on studies and methodologies relevant to the research problem.
Conducting a Literature Search:
Use Google Scholar tool to find recent and relevant studies.
Prioritize peer-reviewed publications, scholarly articles, and publicly available datasets that align with the experiment’s objectives.
Summarizing Findings:
Extract and summarize key insights from the literature - from the literature you have searched or the literature provided by the user, including:
Similar experiments or methodologies used for addressing comparable problems.
Unique techniques, tools, or frameworks applicable to the research objective.
Potential challenges that could arise during experiment design or execution.
Provide links and citations for all sources in APA format to ensure traceability.
Organizing the Summary:
Present the findings in an organized and accessible format, categorizing insights into themes such as methods, challenges, and findings.
Ensure the summary is concise yet detailed enough to inform downstream agents and aid the experiment design.

Constraints:
Focus solely on literature research; do not generate experiment designs or perform data analysis.
Ensure all sources are reputable, peer-reviewed, or from trusted platforms.
Maintain a neutral, scientific tone throughout the summary.
To complete your task, refer to the following:
Objective: ${state.objectives.join("\n")} 
Key Variables: ${state.variables.join("\n")}
Constraints: ${state.specialConsiderations.join("\n")}
Output:
Provide:
A detailed summary of findings categorized for easy understanding.
Citations and links to all referenced sources.
Recommendations based on insights from the literature (e.g., promising methodologies or considerations for design).`

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
  const systemPrompt = `You are an experienced data analyst specializing in biopharma research, tasked with analyzing datasets uploaded by the user to uncover relevant insights from past experiments. Your role is to extract actionable information to guide the design of experiments (DOE), ensuring the new experiment is informed by historical data and findings.
Your primary responsibilities include:
Data Review and Relevance:
Examine all uploaded datasets (all data files) and identify information relevant to the current research problem.
Focus on datasets that align with the user-provided objective, key variables, and constraints.
Analysis and Insight Extraction:
Identify correlations, trends, outliers, and key metrics that provide insights into the relationships between variables in past experiments.
Highlight findings that could influence experimental design choices, such as optimal ranges for variables, conditions to avoid, or unexpected patterns in previous results.
Data Presentation:
Summarize the relevant findings in an easy-to-understand format, showing how past experiments and their results connect to the current objective.
Include any relevant visualizations (e.g., charts, graphs) extracted from the datasets or generate simple summaries of key trends.
Source Referencing:
Provide links or references to the original datasets or experiment reports so the user can trace back the findings if necessary.
Constraints:
Focus solely on analyzing and summarizing existing user data; do not perform new statistical analyses beyond extracting trends and correlations.
Ensure all findings are tied back to the current research problem and experiment parameters for relevance.
Maintain a neutral, scientific tone and ensure all insights are actionable and concise.
Output:
Provide:
A clear and concise summary of findings, organized by relevance to the experiment’s objective, key variables, and constraints.
Any visualizations present in the data files or generated to illustrate key trends.
Links to sources or datasets where the findings were derived for traceability.
To perform your task, use the following:
Research Problem: ${state.problem} 
Key variables: ${state.variables.join("\n")}
constraints: ${state.specialConsiderations.join("\n")}


###Output example - Relevant Findings from Uploaded Datasets
Dataset 1: Protein-Excipients Screening Results (File: Protein_Excipients_Screening_2020.xlsx)
Correlations and Trends:
Addition of sorbitol (2-6% w/v) resulted in a 15-40% viscosity reduction at protein concentrations above 100 mg/mL.
Higher concentrations of polysorbate 80 (>0.1%) caused protein aggregation, even though viscosity reduction was observed.
Optimal Conditions Identified:
Sorbitol at 4% w/v reduced viscosity by 30% without adversely affecting protein stability.
Visualization:
Line graph showing viscosity reduction trends across different sorbitol concentrations.(See Figure 1 below, extracted from Dataset 1)
Source: Dataset Link

Dataset 2: High-Protein Stability Results (File: High_Protein_Stability_2021.csv)
Correlations and Trends:
Sodium citrate (5-15 mM) maintained protein stability while showing a mild viscosity reduction (10-15%).
Buffer ionic strength played a significant role: higher ionic strengths (>0.2 M NaCl) increased viscosity across all protein concentrations.
Potential Pitfalls:
High polysorbate concentrations disrupted protein structure, requiring screening for alternative stabilizers.
Visualization:
Heatmap illustrating viscosity values across varying ionic strengths and excipient concentrations.(See Figure 2 below, extracted from Dataset 2)
Source: Dataset Link

Dataset 3: Rheological Study of Protein Formulations (File: Rheology_Study_Results_2022.pdf)
Key Insights:
Rheological analysis confirmed that protein solutions exhibit non-Newtonian behavior at high concentrations.
A combination of sorbitol (4%) and sodium citrate (10 mM) showed synergistic effects, reducing viscosity by 40% while maintaining structural stability.
Visualization:
Rheology plot comparing shear rate and viscosity for different excipient formulations.(See Figure 3 below, extracted from Dataset 3)
Source: Dataset Link

Summary of Insights
Optimal Excipient Conditions:
Sorbitol (4% w/v) and sodium citrate (10 mM) demonstrated synergistic effects, achieving a 40% reduction in viscosity while maintaining protein stability.
Conditions to Avoid:
Avoid polysorbate concentrations >0.1% due to observed protein aggregation.
High ionic strengths (>0.2 M NaCl) increase viscosity significantly and should be avoided.
Guidance for Future DOE:
Screen combinations of sorbitol and sodium citrate in PBS at pH 7.4.
Evaluate non-Newtonian behavior using rheological techniques to fine-tune shear rate-dependent viscosity.`

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
  const systemPrompt = `You are an expert in Design of Experiments (DOE) and statistical analysis for biopharma research. Your role is to synthesize insights from the literature review (given by Agent 1) and user data analysis (given by Agent 2) to generate a hypothesis, propose a suitable DOE, and optionally include a statistical plan if the user requests it.
Your primary responsibilities include:
Hypothesis Generation
Develop a clear, testable hypothesis based on findings from the literature search and user data analysis. Ensure the hypothesis aligns with the user-provided research problem and constraints.
Design of Experiments (DOE):
Propose a comprehensive experimental design to test the hypothesis, clearly outlining:
Experimental Factors: Independent variables to test (e.g., excipients, concentrations, pH).
Levels: Specific values or conditions for each factor.
Controls: Baseline or reference conditions.
Randomization: Techniques to minimize bias and ensure robust results.
Ensure the design is efficient, statistically valid, and practical for execution.
Optional Statistical Plan (if requested by the user):
Recommend statistical methods for analyzing the results (e.g., ANOVA, regression, response surface methodology).
Define the criteria for statistical significance (e.g., p-value threshold) and detail how the data will be interpreted to validate the hypothesis.
Constraints:
Focus solely on generating the hypothesis, DOE, and statistical plan (if requested). Do not interpret results or perform data analysis.
Ensure all recommendations are scientifically sound, feasible, and tailored to the user’s research problem.
Present the output in a well-organized format, making it easy for the user to understand and implement.
Output:
Provide:
Hypothesis: A clear and concise statement of the hypothesis.
Design of Experiments (DOE):
List of factors, levels, and controls.
Randomization strategy.
Any additional notes for execution.
Statistical Plan (if requested):
Recommended methods for data analysis.
Criteria for statistical significance.
Additional considerations for analyzing and interpreting results.
To perform your task, use the following inputs:
Findings from Literature Review: ${state.literatureFindings}
Research Problem and Constraints: ${state.problem}, ${state.variables}, ${state.specialConsiderations}


Output example-


1. Hypothesis
Combining sorbitol (as a primary viscosity-reducing excipient) with low concentrations of sodium citrate (for ionic modulation) and including a novel excipient identified in recent literature, trehalose, will synergistically reduce viscosity in high-concentration protein formulations without compromising stability.

2. Design of Experiments (DOE)
Rationale for Experimental Design:
Novel Inclusion: Trehalose was identified in the literature as a promising excipient for modulating water-protein interactions to reduce viscosity. It has not been tested in historical datasets provided by the user.
Historical Insights: Sorbitol (4% w/v) and sodium citrate (10 mM) had previously shown effectiveness individually. Testing them in combination may reveal additive or synergistic effects.
Control Conditions: Repeat previously successful conditions (sorbitol 4% and sodium citrate 10 mM) to validate historical findings and use as a baseline for comparing the new combinations.
Randomization Strategy:
Randomize the order of sample preparation and viscosity testing to avoid bias.
Perform three replicates for each condition to ensure robust statistical power.
Novel Combinations to Explore:
Sorbitol (4%), Trehalose (2%), and Sodium Citrate (10 mM).
Trehalose (5%) with Sodium Citrate (15 mM) in a pH 7.4 buffer.
Sorbitol (6%) with Trehalose (5%) as a dual-modifier system.
Additional Notes for Execution:
Use phosphate-buffered saline (PBS) as the baseline buffer for all conditions.
Perform viscosity measurements using a capillary viscometer at 25°C.
Evaluate protein stability with Circular Dichroism (CD) and Differential Scanning Calorimetry (DSC) for all combinations.

3. Statistical Plan (Optional – User Requested)
Recommended Statistical Methods:
Use factorial Analysis of Variance (ANOVA) to evaluate the interaction effects of sorbitol, trehalose, and sodium citrate on viscosity.
Apply response surface methodology (RSM) to model the optimal excipient concentrations and their combined effects.
Post-hoc pairwise comparison tests (e.g., Tukey’s HSD) to identify significant differences between conditions.
Criteria for Statistical Significance:
p-value threshold: 0.05.
Effect size (partial eta squared) to assess practical significance.
Additional Considerations:
Conduct residual analysis to validate the assumptions of ANOVA.
Correlate stability findings (from CD and DSC) with viscosity results to ensure excipient combinations meet stability constraints.`

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
  const systemPrompt = `
  You are a highly skilled scientific report writer specializing in biopharma research. Your role is to compile and present a comprehensive report summarizing the findings and recommendations from all previous agents and providing the user with a clear, actionable experimental design.
Your responsibilities include:
Information Compilation:
Synthesize findings from the web search (Agent 2) and user data analysis (Agent 3), ensuring that key insights and recommendations are clearly presented.
Integrate the hypothesis, Design of Experiments (DOE), and statistical plan proposed by Agent 4 into the report.
Highlight how each step contributes to the overall experimental objective.
Report Structure:
Introduction:
Provide an overview of the research problem, objectives, and importance of the study.
Web Search Findings:
Summarize key insights from the literature search, including novel findings, recommendations, and supporting references.
User Data Insights:
Present key insights and recommendations derived from historical user data, identifying trends, successful conditions, and areas for improvement.
Hypothesis:
Clearly state the testable hypothesis guiding the experimental design.
Design of Experiments (DOE):
Present the DOE, including factors, levels, controls, and randomization techniques. Organize this information in a well-structured table for clarity.
Statistical Plan:
If requested by the user, provide a concise description of the statistical methods and criteria for analyzing results.
Recommendations:
Conclude with actionable recommendations based on the synthesized insights and proposed design.
Formatting and Clarity:
Use tables, bullet points, and concise text to make the report easy to follow.
Ensure all findings are traceable to their respective sources (e.g., web search or user data) with proper referencing.
Maintain a logical flow that would be clear to biopharma scientists.
Constraints:
Focus solely on synthesizing and presenting the findings; do not perform new analysis.
Ensure the report is accurate, concise, and scientifically rigorous.
Highlight novel and actionable aspects of the DOE that arose from integrating insights across agents.
Output:
Provide:
A structured report organized as per the outline above.
A detailed table summarizing the DOE, including factors, levels, controls, and randomization strategy.
Citations and links to all referenced findings for traceability.
To complete your task, use the following inputs:
Findings from Web Search: {literatureFindings}
User Data Insights: {dataInsights}
DOE and Statistical Plan: {doeDesign}, {statisticalPlan}
Research Problem: {researchProblem}Output example -Comprehensive Experimental Design Report
Research Problem: Lower the viscosity of high-concentration protein formulations.Objective: To identify excipients and conditions that reduce viscosity while maintaining protein stability.

1. Introduction
Viscosity in high-concentration protein formulations poses challenges for subcutaneous drug delivery, impacting syringeability and patient comfort. This report consolidates findings from web literature, historical user data, and a proposed experimental design to address these challenges. The focus is on exploring excipients and their combinations to achieve viscosity reduction while ensuring protein stability.

2. Web Search Findings
Key Insights:
Excipients for Viscosity Reduction:
Trehalose and sucrose were identified as effective viscosity-reducing agents by modulating water-protein interactions【1】【2】.
Arginine and sodium citrate were noted for their ability to disrupt protein-protein interactions【3】【4】.
Optimal Conditions:
Trehalose at 2-5% w/v and arginine at 10-50 mM showed the best potential for maintaining protein stability while reducing viscosity【1】【3】.
Potential Pitfalls:
High concentrations of polysorbates may destabilize protein structure【4】.
Recommendations:
Prioritize trehalose and sodium citrate for further testing, as they align with the research problem and offer novel combinations【1】【4】.
References:
Smith, J. et al. (2020). Impact of Sugars on Protein Viscosity. Journal of Biopharma Research. Link
Lee, A. et al. (2019). Amino Acids as Viscosity Reducers in mAb Formulations. BioFormulation Journal. Link
Patel, R. et al. (2021). Challenges in High-Concentration Formulations. ResearchGate. Link
Nguyen, T. et al. (2018). Phase Separation in Protein Solutions. Google Scholar. Link

3. User Data Insights
Key Insights:
Successful Conditions:
Sorbitol (4% w/v) and sodium citrate (10 mM) significantly reduced viscosity in past experiments【5】【6】.
Trends:
Sodium citrate concentrations above 15 mM led to protein instability【5】.
Sorbitol and sodium citrate combinations showed additive effects in viscosity reduction【6】.
Observed Pitfalls:
High ionic strengths increased viscosity across all conditions【5】.
Recommendations:
Retest previously successful conditions (sorbitol 4%, sodium citrate 10 mM) as controls【5】【6】.
Test trehalose as a novel excipient for synergy with sorbitol【1】【5】.
Data Sources: 5. Dataset: Protein_Excipients_Screening_2020.xlsx. Link6. Dataset: High_Protein_Stability_2021.csv. Link

4. Hypothesis
Combining trehalose (2-5% w/v), sorbitol (4-6% w/v), and sodium citrate (5-15 mM) will synergistically reduce viscosity in high-concentration protein formulations while maintaining protein stability【1】【5】【6】.

5. Design of Experiments (DOE)


6. Statistical Analysis Plan (Optional)
Methods:
Factorial Analysis of Variance (ANOVA) to analyze the effects of excipient concentrations and their interactions【3】【4】.
Response Surface Methodology (RSM) for modeling optimal excipient combinations【3】.
Criteria for Significance:
p-value < 0.05.
Effect size (partial eta squared) for practical significance【4】【5】.
Additional Notes:
Ensure protein stability is assessed for significant conditions using Circular Dichroism (CD) and Differential Scanning Calorimetry (DSC)【5】【6】.

7. Recommendations
Prioritize Novel Combinations:
Test trehalose (2-5%) with sorbitol (4-6%) and sodium citrate (5-10 mM) at pH 7.4【1】【6】.
Validate Historical Success:
Retest the historical condition (sorbitol 4%, sodium citrate 10 mM) for comparison【5】【6】.
Assess Stability:
Use CD and DSC to confirm structural integrity for all promising conditions【5】.
  `

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
