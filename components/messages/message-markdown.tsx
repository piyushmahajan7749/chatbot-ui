import React, { FC } from "react"
import remarkGfm from "remark-gfm"
import remarkMath from "remark-math"
import { cn } from "@/lib/utils"
import { MessageCodeBlock } from "./message-codeblock"
import { MessageMarkdownMemoized } from "./message-markdown-memoized"

// Enhanced chemical formula and math rendering component
const ChemicalFormula: React.FC<{ children: React.ReactNode }> = ({
  children
}) => {
  const formulaText = React.Children.toArray(children).join("")

  // Basic chemical formula formatting (subscripts/superscripts)
  const formatChemical = (text: string) => {
    return text
      .replace(/(\d+)/g, "<sub>$1</sub>") // Numbers become subscripts
      .replace(/\^(\d+[\+\-]?)/g, "<sup>$1</sup>") // Charges become superscripts
      .replace(/(\+|\-)/g, "<sup>$1</sup>") // Isolated charges
  }

  return (
    <span
      className="rounded bg-slate-100 px-1 py-0.5 font-mono text-sm dark:bg-zinc-800"
      dangerouslySetInnerHTML={{ __html: formatChemical(formulaText) }}
    />
  )
}

interface MessageMarkdownProps {
  content: string
  isUser?: boolean
}

export const MessageMarkdown: FC<MessageMarkdownProps> = ({
  content,
  isUser = false
}) => {
  // Enhanced content preprocessing for scientific notation
  const preprocessContent = (text: string) => {
    // Handle scientific notation (e.g., 1.23e-4 -> 1.23 × 10^-4)
    text = text.replace(/(\d+\.?\d*)[eE]([\+\-]?\d+)/g, "$1 × 10^$2")

    // Handle degree symbols
    text = text.replace(/(\d+)\s*deg(rees?)?/gi, "$1°")
    text = text.replace(/(\d+)\s*celsius/gi, "$1°C")
    text = text.replace(/(\d+)\s*fahrenheit/gi, "$1°F")

    return text
  }

  const processedContent = preprocessContent(content)

  return (
    <MessageMarkdownMemoized
      className={cn(
        "prose prose-p:leading-relaxed prose-pre:p-0 min-w-full space-y-6 break-words",
        isUser
          ? "prose-invert prose-code:bg-blue-500/30 prose-code:text-white prose-a:text-blue-200 prose-strong:text-white prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
          : "dark:prose-invert prose-code:bg-slate-100 prose-code:dark:bg-zinc-800 prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm"
      )}
      remarkPlugins={[remarkGfm, remarkMath]}
      components={{
        p({ children }) {
          return <p className="mb-2 last:mb-0">{children}</p>
        },
        img({ node, ...props }) {
          return <img className="max-w-[67%]" {...props} />
        },
        code({ node, className, children, ...props }) {
          const childArray = React.Children.toArray(children)
          const firstChild = childArray[0] as React.ReactElement
          const firstChildAsString = React.isValidElement(firstChild)
            ? (firstChild as React.ReactElement).props.children
            : firstChild

          if (firstChildAsString === "▍") {
            return <span className="mt-1 animate-pulse cursor-default">▍</span>
          }

          if (typeof firstChildAsString === "string") {
            childArray[0] = firstChildAsString.replace("`▍`", "▍")
          }

          const match = /language-(\w+)/.exec(className || "")
          const codeText = String(childArray)

          // Detect if this might be a chemical formula
          if (
            typeof firstChildAsString === "string" &&
            !firstChildAsString.includes("\n") &&
            /^[A-Za-z0-9\+\-\(\)\[\]]+$/.test(firstChildAsString) &&
            /[A-Z][a-z]*\d*/.test(firstChildAsString)
          ) {
            return <ChemicalFormula>{childArray}</ChemicalFormula>
          }

          if (
            typeof firstChildAsString === "string" &&
            !firstChildAsString.includes("\n")
          ) {
            return (
              <code
                className={cn(
                  className,
                  "rounded px-1 py-0.5 font-mono text-sm",
                  isUser
                    ? "bg-blue-500/30 text-white"
                    : "bg-slate-100 dark:bg-zinc-800"
                )}
                {...props}
              >
                {childArray}
              </code>
            )
          }

          return (
            <MessageCodeBlock
              key={Math.random()}
              language={(match && match[1]) || ""}
              value={String(childArray).replace(/\n$/, "")}
              {...props}
            />
          )
        }
      }}
    >
      {processedContent}
    </MessageMarkdownMemoized>
  )
}
