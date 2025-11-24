import { Inngest } from "inngest"

// Create an Inngest client
export const inngest = new Inngest({
  id: "chatbot-ui",
  name: "Chatbot UI",
  eventKey: process.env.INNGEST_EVENT_KEY,
  // In development, send events to local dev server instead of Inngest Cloud
  ...(process.env.NODE_ENV === "development" && {
    eventKey: undefined,
    isDev: true
  })
})
