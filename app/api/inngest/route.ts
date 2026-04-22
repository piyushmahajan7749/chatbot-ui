import { serve } from "inngest/next"
import { inngest } from "@/lib/inngest/client"
import { processDesignDraft } from "@/lib/inngest/functions"

// Create an API route that serves Inngest functions
export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    processDesignDraft
    // Add more Inngest functions here as needed
  ]
})
