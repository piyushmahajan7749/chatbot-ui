# Experiment Design Researcher Integration

This feature integrates [GPT Researcher](https://docs.gptr.dev/) into the application to enhance experiment design with advanced research capabilities.

## Features

- **AI-Powered Research**: Automatically searches the web for relevant scientific literature based on research problems.
- **Enhanced Literature Review**: Incorporates findings from published research into experiment designs.
- **Visual Research Interface**: Uses the `gpt-researcher-ui` component to display research results.
- **Integrated Workflow**: Seamlessly integrates research findings into the experiment design process.

## Components

1. **Backend API**: The modified `app/api/design/draft/route.ts` file integrates GPT Researcher with our existing LangGraph workflow.

2. **Researcher Interface**: The `app/components/ResearcherInterface.tsx` component provides a user-friendly interface for experiment design with research capabilities.

3. **Researcher Page**: Access the standalone researcher interface at `/researcher`.

## Usage

1. Navigate to the Researcher section using the sidebar microscope icon.
2. Enter your research problem, objectives, variables, and special considerations.
3. Click "Generate Research Design" to start the process.
4. View the comprehensive research report, including:
   - Experiment design details
   - Research summary
   - Raw research data (when debug option is enabled)

## Environment Setup

Ensure the following environment variables are set:

```
OPENAI_KEY=your_openai_api_key
SERPAPI_API_KEY=your_serpapi_key
```

## Dependencies

- `gpt-researcher`: Backend research functionality
- `gpt-researcher-ui`: Frontend research visualization

## Implementation Details

The researcher workflow:

1. Accepts user input about the research problem
2. Uses GPT Researcher to search for relevant scientific literature
3. Processes research findings with an LLM to extract structured data
4. Integrates research findings into the experiment design process
5. Generates a comprehensive report with design recommendations

## Troubleshooting

If you encounter issues:

1. Check that all required API keys are set correctly
2. Verify network connectivity for web research
3. Monitor the server logs for detailed error information

## Future Enhancements

- Integration with local document search
- Support for file uploads to include in research context
- Enhanced visualization of research data
- Filtering and sorting options for research findings
