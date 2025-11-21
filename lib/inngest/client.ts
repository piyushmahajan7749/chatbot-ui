import { Inngest } from "inngest"

// Create an Inngest client
export const inngest = new Inngest({
  id: "chatbot-ui",
  name: "Chatbot UI",
  eventKey: process.env.INNGEST_EVENT_KEY
})
