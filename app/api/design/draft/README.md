# Design Draft API - Refactored Structure

This API has been refactored for better readability, maintainability, and organization. The code is now modular and follows clean architecture principles.

## Directory Structure

```
app/api/design/draft/
├── route.ts                 # Main API route (clean & minimal)
├── README.md               # This documentation
├── agents/
│   └── index.ts            # All agent implementations
├── prompts/
│   └── agent-prompts.ts    # All agent prompts separated
├── types/
│   └── index.ts            # TypeScript interfaces & Zod schemas
└── utils/
    └── search-utils.ts     # Search utilities & rate limiting
```

## Key Improvements

### 1. **Separation of Concerns**

- **Main Route (`route.ts`)**: Only contains workflow orchestration and API handling
- **Agents (`agents/index.ts`)**: Contains all agent logic and OpenAI API calls
- **Prompts (`prompts/agent-prompts.ts`)**: All prompts extracted into functions
- **Types (`types/index.ts`)**: All interfaces and Zod schemas centralized
- **Utils (`utils/search-utils.ts`)**: Search functionality and rate limiting

### 2. **Improved Readability**

- Main route file reduced from ~1850 lines to ~200 lines
- Clear separation between different functionalities
- Easy to find and modify specific components
- Better error handling and logging

### 3. **Better Maintainability**

- Prompts can be easily modified without touching agent logic
- Types are centralized and reusable
- Search utilities are modular and testable
- Each agent is clearly separated and focused

## Agent Workflow

The API follows a 6-agent sequential workflow:

1. **Design Planner Agent** - Orchestrates the process
2. **Literature Scout Agent** - Searches and analyzes research papers
3. **Hypothesis Builder Agent** - Creates testable hypotheses
4. **Experiment Designer Agent** - Designs complete lab-ready experiments
5. **Stat Check Agent** - Reviews for statistical soundness
6. **Report Writer Agent** - Creates comprehensive reports

## Usage

The API endpoint remains the same:

```typescript
POST /api/design/draft

// Request body:
{
  "problem": "Research problem description",
  "objectives": ["objective1", "objective2"],
  "variables": ["variable1", "variable2"],
  "specialConsiderations": ["consideration1", "consideration2"]
}

// Response:
{
  "success": true,
  "reportWriterOutput": { /* Final comprehensive report */ },
  "agentOutputs": { /* All individual agent outputs */ },
  "searchResults": { /* Literature search results */ }
}
```

## Environment Variables Required

```env
OPENAI_KEY=your_openai_api_key
SERPAPI_API_KEY=your_serpapi_key
TAVILY_API_KEY=your_tavily_key (optional)
```

## Key Features

- **Multi-source Literature Search**: PubMed, ArXiv, Semantic Scholar, Google Scholar, Tavily
- **Enhanced Rate Limiting**: Intelligent backoff strategies for API calls
- **AI-Powered Synthesis**: Automated extraction of research insights
- **Comprehensive Validation**: Statistical and logical experiment review
- **Lab-Ready Output**: Detailed execution plans with materials, procedures, timelines

## Modifying the System

### To Update Prompts

Edit `prompts/agent-prompts.ts` - each agent has its own prompt function.

### To Add New Agents

1. Add agent function to `agents/index.ts`
2. Add agent output types to `types/index.ts`
3. Update workflow in `route.ts`
4. Create prompt function in `prompts/agent-prompts.ts`

### To Modify Search Logic

Edit `utils/search-utils.ts` for search functionality and rate limiting.

### To Update Types

Edit `types/index.ts` for interfaces and Zod schemas.

## Benefits of This Structure

1. **Easy Debugging**: Each component is isolated and can be tested separately
2. **Fast Development**: Changes to prompts don't require touching agent logic
3. **Better Testing**: Modular structure allows for unit testing of components
4. **Scalability**: Easy to add new agents or modify existing ones
5. **Documentation**: Clear separation makes the codebase self-documenting
