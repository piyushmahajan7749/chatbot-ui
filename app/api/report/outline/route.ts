import { StateGraph, END, START } from "@langchain/langgraph"
import { ChatOpenAI } from "@langchain/openai"
import OpenAI from "openai"
import { z } from "zod"
import { zodResponseFormat } from "openai/helpers/zod"
import { ChatPromptTemplate } from "@langchain/core/prompts"
import { NextResponse } from "next/server"
import { AIMessage, BaseMessage, HumanMessage } from "@langchain/core/messages"

// Initialize language models
const minillm = new ChatOpenAI({
  modelName: "gpt-4o-mini-2024-07-18",
  temperature: 0.7,
  apiKey: process.env.OPENAI_KEY
})
const llm = new ChatOpenAI({
  modelName: "gpt-4o-2024-08-06",
  temperature: 0.7,
  apiKey: process.env.OPENAI_KEY
})

const openai = new OpenAI({
  apiKey: process.env.OPENAI_KEY
})

type ScenarioOutputType = z.infer<typeof ScenarioOutput>

const DiscoveryBeats = z.object({
  setup: z.string(),
  discover: z.string(),
  learn: z.string(),
  evaluate: z.string()
})

const OnboardingBeats = z.object({
  setup: z.string(),
  launch: z.string(),
  activity: z.string(),
  feedback: z.string(),
  completion: z.string()
})

const HabitLoopBeats = z.object({
  setup: z.string(),
  cue: z.string(),
  activity: z.string(),
  feedback: z.string(),
  progress: z.string()
})

const MasteryBeats = z.object({
  setup: z.string(),
  unlocking: z.string(),
  invites: z.string(),
  milestones: z.string(),
  access: z.string()
})

const ScenarioOutput = z.object({
  discoveryBeats: DiscoveryBeats,
  onboardingBeats: OnboardingBeats,
  habitloopBeats: HabitLoopBeats,
  masteryBeats: MasteryBeats
})

// Define interfaces
interface ScenarioState {
  storyLine: string
  elevatorPitch: string
  habitStories: string[]
  jobStories: string[]
  discoveryBeats: string
  habitloopBeats: string
  onboardingBeats: string
  masteryBeats: string
  finalOutput: ScenarioOutputType
  discoverySetting: string
  onboardingSetting: string
  habitloopSetting: string
  masterySetting: string
}

// Define agents
const storyWriterAgent = ChatPromptTemplate.fromTemplate(
  `You are an expert UX designer specializing in creating a story of how a customer experiences a product over time.

  The key moments in a product story are these -

	1. Discovery: The initial phase where users first encounter the story or system, focusing on sparking interest and engagement.
	2. Onboarding: This phase teaches users the basics, helping them understand how to navigate and interact within the story or game environment.
	3. Habit Loop: Here, the design focuses on creating compelling routines and challenges that keep users coming back. It's about building a cycle of actions and rewards that encourage ongoing engagement and deeper involvement in the story or gameplay.
	4. Mastery: In this final phase, users apply their skills and knowledge to overcome challenges and achieve their goals, fully engaging with the system with little to no guidance, and exploring deeper aspects of the narrative or game mechanics.
      
  Given the following elevator pitch, job stories, and the settings for each phase, create a story line for this product:
  Elevator Pitch: {elevatorPitch}
  Habit Stories: {habitStories}
  Job Stories: {jobStories}
  Discovery Setting: {discoverySetting}
  Onboarding Setting: {onboardingSetting}
  Habitloop Setting: {habitloopSetting}
  Mastery Setting: {masterySetting}

  Do not use any character name, instead use You as a placeholder.
`
)

const discoveryBeatsAgent = ChatPromptTemplate.fromTemplate(
  `You are a Senior Product Researcher who is expert at creating story beats for the disovery phase, which are key moments in a customer's journey discovering your product.

Key components of Discovery Story beats are these:
  Setup - Describe a CONTEXT (time, place, activity, device) where they're first discovering your product e.g. on social media, seeing an in-game ad, talking with friends or family, or at work with colleagues or HR.
  First Impression - Describe what they SEE FIRST that inspires them to take an action & check your product out  e.g. ad, video, message, post, search results
  Wants to learn more - Describe the NEXT STEP they take to learn more once they're interested e.g. click through & view the landing page, app store listing, video demo, etc,
  Evaluates further - Describe what INFORMATION they look for to help them make a decision & CONVERT - e.g. product details, pricing, reviews, testimonials,  

  
Your job is to create well formatted Discovery beats, given the following elevator pitch, job stories, and the story line:
Elevator Pitch: {elevatorPitch}
Job Stories: {jobStories}
Story Line: {storyLine}
Discovery Setting: {discoverySetting}

Each beat should be a short single statement, with no special characters that demonstrates how the product is discovered and initially evaluated by the user.
Ensure each beat is unique, engaging, and addresses the product's value proposition.
Incorporate the given discovery setting into your beats where appropriate.

For example, here are the Discovery Story beats for a text-based therapy service app:
Setup: While scrolling on your phone, you see an interesting post about a new text-based therapy service.
First Impression: You visit the website and read about this text-based Continuous Care mental health service.
Wants to learn more: You look at the Privacy Policies to make sure what you share is secure & HIPPA-approved.
Evaluate: You look at the FAQ and find out the cost, and whether it's covered by your insurance.
`
)

const onboardingBeatsAgent = ChatPromptTemplate.fromTemplate(
  `You are a Senior Product Researcher who is expert at creating story beats for the onboarding phase, which are key moments in a customer's journey onboarding your product.

Key components of Onboarding Story beats are these:
  - Setup: Describe the CONTEXT (time, place, activity, device) when they first learn about your product - e.g. getting comfortable at home, working at the office, riding on public transit, sitting in bed & scrolling on their phone.
  - Getting Started: Describe their first experience using your product - What do they see? How do they get oriented? e.g. introductory carousel, short tutorial, instructions, video, demo, in-person session.
  - First Activity: Describe the activity they DO FIRST during onboarding e.g. chat with a bot, customize your avatar, attend a meeting, post something, read something, create something.
  - Feedback/Progress: Describe how they know they're making PROGRESS - including the feedback they get e.g. messages, tutorial, collections, progress bar, improved content-matching algorithm.
  - Completion: Describe what happens at the end of onboarding, and explain how they know they've finished a meaningful stage of learning and can now get value from your product. Also include how And they know what to do next.

  
Your job is to create well formatted Onboarding beats, given the following elevator pitch, job stories, and the story line:
Elevator Pitch: {elevatorPitch}
Job Stories: {jobStories}
Story Line: {storyLine}
Onboarding Setting: {onboardingSetting}

Each beat should be a short single statement, with no special characters that demonstrates how a usr onboards the app.
Ensure each beat is unique, engaging, and addresses the product's value proposition.
Incorporate the given onboarding setting into your beats where appropriate.

For example, here are the Onboarding Story beats for a text-based therapy service app:
Setup: You decide to try out the saervice, so you download the app & sign up for a free trial.
Getting Started: You setup your account and enter your credit card.
First Activity: You answer a series of intake questions about your background, current issues, and goals for therapy.
Feedback/Progress: You see a progress bar letting you know how far you've come & how much is left to do.
Completion: Once you've answer the questions, you setup an appointment to meet with your therapist live and online.
`
)

const habitloopBeatsAgent = ChatPromptTemplate.fromTemplate(
  `You are a Senior Product Researcher who is expert at creating story beats for the habit loop phase, which are key moments in a customer's journey forming a habit of using your product.

Key components of Habit loop Story beats are these:
  - Setup: Describe a CONTEXT (time, place, activity, device) where they're returning to your product after learning the ropes & using it for a while. 
  - Trigger/Cue: Describe the CUE OR TRIGGER that reminds them to re-engage - which could be internal (hunger, boredom, anxiety, lonliness, joy, or anger), situational (meals, daily routines, starting or ending work, walking the dog, feeding the cat) external (gym bag in the car, stickies on the computer, getting notifications from an app) 
  - Engaging Activity: Describe what they DO to re-engage & the (chain of) events they experience during a typical session. The core activity will often be something quick and mundane that is a natural and necessary part of using the product, e.g. monitoring your health, checking your bank account, playiing a round of a game.
  - Skill-building Feedback: Descrbie the SIGNALS OR FEEDBACK they receive that lets them know how they're doing e.g. likes & comments, sharing content, scores, ratings, completion screens, real-time feedback on performance
  - Progress: Describe how they make PROGRESS on something meaningful by re-engaging regularly with your product e.g. hitting milestones, levelling-up, collaborating with a colleague, finishing a task 
  
Your job is to create well formatted Habit loop beats, given the following elevator pitch, habit stories, and the story line:
Elevator Pitch: {elevatorPitch}
Habit Stories: {habitStories}
Story Line: {storyLine}
Habitloop Setting: {habitloopSetting}

Each beat should be a short single statement, with no special characters.
Ensure each beat is unique, engaging, and addresses the product's value proposition.
Incorporate the given habitloop setting into your beats where appropriate.

For example, here are the Habit loop Story beats for a text-based therapy service app:

setup: While you're walking to work one morning, you get a message from your therapist checking in & prompting you to try out one of your new skills
cue: Your therapist messages you, at a time you setup together
activity: You practice box breathing while you're headed to work
feedback: You click DONE on your app & your therapist texts you a complimentary note
progress: You see your Skills Dashboard update after you're practiced that skill
`
)

const masteryBeatsAgent = ChatPromptTemplate.fromTemplate(
  `You are a Senior Product Researcher who is expert at creating story beats for the Mastery phase, which are key moments in a customer's journey mastering your product.

Key components of Mastery Story beats are these:

  - Setup: Describe a CONTEXT (time, place, activity, device) where customer are returning to your product after using to regularly & mastering the systems & features. Note: some products don't need a mastery phase, but it's still useful to imagine what the mastery phase might be.
  - Unlocking Content/Activities: Describe content or activities they can unlock (aka access) if they returned regularly and/or pay more - e.g. advanced lessons, detailed analytics dashboard, VIP guest sessions, etc
  - Earning Invites/Discounts: Describe how they might earn a social feature - e.g. invites, discounts, content templates
  - Achieving Milestones: Describe a milestone they can reach that make sense within your product e.g. earn features or achievements, complete levels, collections, or lessons, etc. 
  - Gaining Access/Power: Describe the POWERS OR ACCESS you can gain through mastery, payment or continued use e.g. private rooms, access to the devs, voting on upcoming content or features, gaining powers within the game or product, getting access to an API or internal support
  
Your job is to create well formatted Mastery beats, given the following elevator pitch, job stories, and the story line:
Elevator Pitch: {elevatorPitch}
Job Stories: {jobStories}
Story Line: {storyLine}
Mastery Setting: {masterySetting}

Each beat should be a short single statement, with no special characters that demonstrates how a user masters the use of the app.
Ensure each beat is unique, engaging, and addresses the product's value proposition.
Incorporate the given mastery setting into your beats where appropriate.

For example, here are the Mastery Story beats for a text-based therapy service app:
Setup: While you're working one day you get an upsetting email - so you remember to do your calming & reframing activity before responding
Unlocking Content/Activities: Once you've lowered your anxiety score for 3 months, you earn the option to shift to "maintenance mode" in your therapy
Earning Invites/Discounts: As you improve, your therapist unlocks new activities & challenges for you to tackle
Achieving Milestones: You earn rewards when you text your therapist daily
Gaining Access/Power: When you reduce your anxiety score by X% you get notified and your Dashboard updates
`
)

async function callAgent(
  state: ScenarioState,
  agent: ChatPromptTemplate,
  input: Record<string, any>
) {
  const formattedMessages = await agent.formatMessages(input)
  const messages = formattedMessages.map((msg: BaseMessage) => {
    if (msg instanceof HumanMessage) {
      return { role: "human", content: msg.content }
    } else if (msg instanceof AIMessage) {
      return { role: "ai", content: msg.content }
    } else {
      return { role: "system", content: msg.content }
    }
  })
  const response = await llm.invoke(messages.toString())
  return response.content
}

async function finalValidatorAgent(
  state: ScenarioState
): Promise<ScenarioOutputType> {
  const prompt = `Review and validate the following scenario beats:
  Discovery Beats:
  ${state.discoveryBeats}

  Onboarding Beats:
  ${state.onboardingBeats}

  Habit loop Beats:
  ${state.habitloopBeats}

  Mastery Beats:
  ${state.masteryBeats}

  Elevator Pitch: ${state.elevatorPitch}
  Job Stories: ${state.jobStories.join("\n")}

  For each beat, ensure it:
  1. Aligns with the elevator pitch and overall product concept
  2. Addresses at least one job story
  3. Is realistic and achievable
  4. Provides clear value to the user
  5. Fits logically within its phase of the user journey
  6. Is distinct from other beats and adds unique value to the scenario

  Additionally, verify that:
  1. All beats are filled and flow logically from one to the next, creating a coherent user journey
  2. The entire user journey is well-represented across all phases
  3. Each beat is clear, concise, and engaging

  If any beat doesn't meet these criteria, provide a final, polished version of each beat, maintaining the existing structure and categories.`

  try {
    const completion = await openai.beta.chat.completions.parse({
      model: "gpt-4o-2024-08-06",
      messages: [{ role: "user", content: prompt }],
      response_format: zodResponseFormat(ScenarioOutput, "scenario_output")
    })

    const scenarioOutput = completion.choices[0].message.parsed
    if (scenarioOutput === null) {
      throw new Error("Failed to parse the scenario output")
    }

    return scenarioOutput
  } catch (error) {
    console.error("Error in finalValidatorAgent:", error)
    throw error
  }
}

// Define the workflow
const workflow = new StateGraph<ScenarioState>({
  channels: {
    storyLine: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    elevatorPitch: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    habitStories: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    jobStories: {
      value: (left?: string[], right?: string[]) => right ?? left ?? [],
      default: () => []
    },
    discoveryBeats: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    habitloopBeats: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    onboardingBeats: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    masteryBeats: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    finalOutput: {
      value: (left?: ScenarioOutputType, right?: ScenarioOutputType) =>
        right ?? left ?? ({} as ScenarioOutputType),
      default: () => ({}) as ScenarioOutputType
    },
    discoverySetting: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    onboardingSetting: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    habitloopSetting: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    },
    masterySetting: {
      value: (left?: string, right?: string) => right ?? left ?? ""
    }
  }
})
  .addNode("storyWriterAgent", async (state: ScenarioState) => {
    const content = await callAgent(state, storyWriterAgent, {
      elevatorPitch: state.elevatorPitch,
      jobStories: state.jobStories.join("\n"),
      habitStories: state.habitStories.join("\n"),
      discoverySetting: state.discoverySetting,
      onboardingSetting: state.onboardingSetting,
      habitloopSetting: state.habitloopSetting,
      masterySetting: state.masterySetting
    })

    return { ...state, storyLine: content }
  })
  .addNode("generateDiscoveryBeats", async (state: ScenarioState) => {
    const content = await callAgent(state, discoveryBeatsAgent, {
      elevatorPitch: state.elevatorPitch,
      jobStories: state.jobStories.join("\n"),
      storyLine: state.storyLine,
      discoverySetting: state.discoverySetting
    })

    return { ...state, discoveryBeats: content }
  })
  .addNode("generateOnboardingBeats", async (state: ScenarioState) => {
    const content = await callAgent(state, onboardingBeatsAgent, {
      elevatorPitch: state.elevatorPitch,
      jobStories: state.jobStories.join("\n"),
      storyLine: state.storyLine,
      onboardingSetting: state.onboardingSetting
    })

    return { ...state, onboardingBeats: content }
  })
  .addNode("generateHabitloopBeats", async (state: ScenarioState) => {
    const content = await callAgent(state, habitloopBeatsAgent, {
      elevatorPitch: state.elevatorPitch,
      habitStories: state.habitStories.join("\n"),
      storyLine: state.storyLine,
      habitloopSetting: state.habitloopSetting
    })

    return { ...state, habitloopBeats: content }
  })
  .addNode("generateMasteryBeats", async (state: ScenarioState) => {
    const content = await callAgent(state, masteryBeatsAgent, {
      elevatorPitch: state.elevatorPitch,
      jobStories: state.jobStories.join("\n"),
      storyLine: state.storyLine,
      masterySetting: state.masterySetting
    })

    return { ...state, masteryBeats: content }
  })
  .addNode("validateAllBeats", async (state: ScenarioState) => {
    const result = await finalValidatorAgent(state)
    return { ...state, finalOutput: result }
  })
  .addEdge(START, "storyWriterAgent")
  .addEdge("storyWriterAgent", "generateDiscoveryBeats")
  .addEdge("generateDiscoveryBeats", "generateOnboardingBeats")
  .addEdge("generateOnboardingBeats", "generateHabitloopBeats")
  .addEdge("generateHabitloopBeats", "generateMasteryBeats")
  .addEdge("generateMasteryBeats", "validateAllBeats")
  .addEdge("validateAllBeats", END)

// Compile the graph
const app = workflow.compile()

export async function POST(req: Request) {
  try {
    const {
      elevatorPitch,
      habitStories,
      jobStories,
      discoverySetting,
      onboardingSetting,
      habitloopSetting,
      masterySetting
    } = await req.json()
    console.log("Received request:", {
      elevatorPitch,
      habitStories,
      jobStories,
      discoverySetting,
      onboardingSetting,
      habitloopSetting,
      masterySetting
    })

    if (!elevatorPitch || !habitStories || !jobStories) {
      return new NextResponse("Missing required fields", { status: 400 })
    }

    const initialState: ScenarioState = {
      elevatorPitch,
      habitStories,
      jobStories,
      storyLine: "",
      discoveryBeats: "",
      onboardingBeats: "",
      masteryBeats: "",
      habitloopBeats: "",
      finalOutput: {} as ScenarioOutputType,
      discoverySetting,
      onboardingSetting,
      habitloopSetting,
      masterySetting
    }

    let finalState: ScenarioState | undefined

    for await (const event of await app.stream(initialState)) {
      for (const [key, value] of Object.entries(event)) {
        finalState = value as ScenarioState
        console.log(`Updated state for ${key}:`, finalState)
      }
    }

    if (finalState) {
      console.log("Final state:", finalState)
      return NextResponse.json(finalState.finalOutput)
    }

    return new NextResponse("Failed to generate scenarios", { status: 500 })
  } catch (error) {
    console.error("[SCENARIO_ERROR]", error)
    return new NextResponse("Internal Error", { status: 500 })
  }
}

export const config = {
  api: {
    bodyParser: process.env.NODE_ENV !== "production"
  }
}
