import { promises as fs } from "fs"
import path from "path"
import {
  ResearchPlan,
  Hypothesis,
  TournamentMatch,
  LogEntry
} from "../types/interfaces"

const DATA_DIR = path.join(
  process.cwd(),
  "app",
  "api",
  "design",
  "draft",
  "data"
)

// Ensure data directory exists
async function ensureDataDir(): Promise<void> {
  try {
    await fs.mkdir(DATA_DIR, { recursive: true })
  } catch (error) {
    // Directory might already exist
  }
}

/**
 * Append an object to a JSON array file
 */
export async function appendToJsonFile<T>(
  filename: string,
  data: T
): Promise<void> {
  await ensureDataDir()
  const filePath = path.join(DATA_DIR, filename)
  let existing: T[] = []

  try {
    const content = await fs.readFile(filePath, "utf-8")
    existing = JSON.parse(content)
    if (!Array.isArray(existing)) {
      existing = []
    }
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn(`[PERSISTENCE] Error reading ${filename}:`, error.message)
    }
    existing = []
  }

  existing.push(data)
  await fs.writeFile(filePath, JSON.stringify(existing, null, 2), "utf-8")
}

/**
 * Read a JSON array file
 */
export async function readJsonFile<T>(filename: string): Promise<T[]> {
  await ensureDataDir()
  const filePath = path.join(DATA_DIR, filename)

  try {
    const content = await fs.readFile(filePath, "utf-8")
    const parsed = JSON.parse(content)
    return Array.isArray(parsed) ? parsed : []
  } catch (error: any) {
    if (error.code === "ENOENT") {
      return []
    }
    console.warn(`[PERSISTENCE] Error reading ${filename}:`, error.message)
    return []
  }
}

/**
 * Write a JSON array file (overwrites)
 */
export async function writeJsonFile<T>(
  filename: string,
  data: T[]
): Promise<void> {
  await ensureDataDir()
  const filePath = path.join(DATA_DIR, filename)
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf-8")
}

/**
 * Update a specific item in a JSON array file by ID
 */
export async function updateJsonFileItem<T extends { [key: string]: any }>(
  filename: string,
  idField: string,
  idValue: string,
  updates: Partial<T>
): Promise<boolean> {
  const items = await readJsonFile<T>(filename)
  const index = items.findIndex(item => item[idField] === idValue)

  if (index === -1) {
    return false
  }

  items[index] = { ...items[index], ...updates }
  await writeJsonFile(filename, items)
  return true
}

/**
 * Find items in a JSON array file by filter
 */
export async function findJsonFileItems<T>(
  filename: string,
  filter: (item: T) => boolean
): Promise<T[]> {
  const items = await readJsonFile<T>(filename)
  return items.filter(filter)
}

// Convenience functions for specific data types
export async function saveResearchPlan(plan: ResearchPlan): Promise<void> {
  await ensureDataDir()
  const filename = "research_plans.json"
  const filePath = path.join(DATA_DIR, filename)

  let plans: ResearchPlan[] = []
  try {
    const content = await fs.readFile(filePath, "utf-8")
    const parsed = JSON.parse(content)
    plans = Array.isArray(parsed) ? parsed : []
  } catch (error: any) {
    if (error.code !== "ENOENT") {
      console.warn(`[PERSISTENCE] Error reading ${filename}:`, error.message)
    }
    plans = []
  }

  const existingIndex = plans.findIndex(p => p.planId === plan.planId)

  if (existingIndex >= 0) {
    plans[existingIndex] = {
      ...plans[existingIndex],
      ...plan
    }
  } else {
    plans.push(plan)
  }

  await fs.writeFile(filePath, JSON.stringify(plans, null, 2), "utf-8")
}

export async function getResearchPlan(
  planId: string
): Promise<ResearchPlan | null> {
  const plans = await readJsonFile<ResearchPlan>("research_plans.json")
  for (let i = plans.length - 1; i >= 0; i--) {
    if (plans[i].planId === planId) {
      return plans[i]
    }
  }
  return null
}

export async function saveHypothesis(hypothesis: Hypothesis): Promise<void> {
  await appendToJsonFile<Hypothesis>("hypotheses.json", hypothesis)
}

export async function getHypothesesByPlanId(
  planId: string
): Promise<Hypothesis[]> {
  return findJsonFileItems<Hypothesis>(
    "hypotheses.json",
    h => h.planId === planId
  )
}

export async function getHypothesisById(
  hypothesisId: string
): Promise<Hypothesis | null> {
  const hypotheses = await readJsonFile<Hypothesis>("hypotheses.json")
  for (let i = hypotheses.length - 1; i >= 0; i--) {
    if (hypotheses[i].hypothesisId === hypothesisId) {
      return hypotheses[i]
    }
  }
  return null
}

export async function updateHypothesis(
  hypothesisId: string,
  updates: Partial<Hypothesis>
): Promise<boolean> {
  return updateJsonFileItem<Hypothesis>(
    "hypotheses.json",
    "hypothesisId",
    hypothesisId,
    updates
  )
}

export async function saveTournamentMatch(
  match: TournamentMatch
): Promise<void> {
  await appendToJsonFile<TournamentMatch>("tournament_matches.json", match)
}

export async function getTournamentMatchesByPlanId(
  planId: string
): Promise<TournamentMatch[]> {
  return findJsonFileItems<TournamentMatch>(
    "tournament_matches.json",
    m => m.planId === planId
  )
}

export async function saveLog(entry: LogEntry): Promise<void> {
  await appendToJsonFile<LogEntry>("logs.json", entry)
}

export async function getLogsByPlanId(
  planId: string,
  limit: number = 20
): Promise<LogEntry[]> {
  const allLogs = await readJsonFile<LogEntry>("logs.json")
  const planLogs = allLogs
    .filter(log => log.context?.planId === planId)
    .sort(
      (a, b) =>
        new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    )
    .slice(0, limit)
  return planLogs
}
