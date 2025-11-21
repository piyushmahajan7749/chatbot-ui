import { inngest } from "./client"
import { supervisorEnqueue } from "@/app/api/design/draft/supervisor"
import { getResearchPlan } from "@/app/api/design/draft/utils/persistence"
import { ResearchPlan } from "@/app/api/design/draft/types/interfaces"

// Inngest function to run the design draft supervisor
export const processDesignDraft = inngest.createFunction(
  {
    id: "process-design-draft",
    name: "Process Design Draft",
    // No timeout - can run as long as needed!
    retries: 2 // Retry up to 2 times on failure
  },
  { event: "design/draft.requested" },
  async ({ event, step }) => {
    const { planId } = event.data

    // Step 1: Fetch the research plan
    const plan = await step.run("fetch-research-plan", async () => {
      const fetchedPlan = await getResearchPlan(planId)
      if (!fetchedPlan) {
        throw new Error(`Research plan ${planId} not found`)
      }
      return fetchedPlan
    })

    // Step 2: Run the supervisor (all phases)
    // Inngest will automatically checkpoint progress
    const result = await step.run("run-supervisor", async () => {
      return await supervisorEnqueue(plan as ResearchPlan)
    })

    return {
      success: true,
      planId: result.planId,
      hypothesesGenerated: result.hypothesesGenerated
    }
  }
)
