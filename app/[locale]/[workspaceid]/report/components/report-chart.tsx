"use client"

import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Cell,
  LabelList
} from "recharts"

export type ChartType = "bar" | "line" | "pie"

interface ReportChartProps {
  data: Array<{ label: string; value: number }>
  chartTitle?: string
  yAxisLabel?: string
  /**
   * Type of plot to render. Defaults to "bar" - persisted on
   * `chart_data.chartType` and toggled via the tab strip above the
   * chart on the report page (#17, #18). When the type changes the
   * client updates state + persists, so refreshing the page keeps the
   * chosen type.
   */
  chartType?: ChartType
}

const COLORS = [
  "#3b82f6",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#84cc16",
  "#f97316",
  "#6366f1"
]

function formatValue(value: number): string {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`
  if (Math.abs(value) >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  if (Number.isInteger(value)) return value.toString()
  return value.toFixed(2)
}

/** Split a label string into lines that fit within `maxChars` per line. */
function wrapLabel(text: string, maxChars: number): string[] {
  if (text.length <= maxChars) return [text]

  const words = text.split(/\s+/)
  const lines: string[] = []
  let current = ""

  for (const word of words) {
    if (current && (current + " " + word).length > maxChars) {
      lines.push(current)
      current = word
    } else {
      current = current ? current + " " + word : word
    }
  }
  if (current) lines.push(current)

  return lines
}

/**
 * Fully custom X-axis tick rendered as a function (not an element).
 * Using a function avoids recharts cloneElement path which can inject
 * unwanted angle/rotation props.
 */
function renderCustomTick(maxCharsPerLine: number) {
  const CustomTick = (tickProps: any) => {
    const { x, y, payload } = tickProps
    const lines = wrapLabel(String(payload.value), maxCharsPerLine)

    return (
      <g transform={`translate(${x},${y})`}>
        {lines.map((line: string, i: number) => (
          <text
            key={i}
            x={0}
            y={0}
            dy={i * 14 + 14}
            textAnchor="middle"
            fontSize={11}
            fill="#374151"
          >
            {line}
          </text>
        ))}
      </g>
    )
  }
  CustomTick.displayName = "CustomTick"
  return CustomTick
}

export function ReportChart({
  data,
  chartTitle,
  yAxisLabel,
  chartType = "bar"
}: ReportChartProps) {
  if (!data || data.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">No chart data available.</p>
    )
  }

  // Compute Y-axis domain with padding so bars never overflow
  const values = data.map(d => d.value)
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range = maxVal - minVal || Math.abs(maxVal) || 1
  const yMin = minVal >= 0 ? 0 : Math.floor((minVal - range * 0.1) * 10) / 10
  const yMax = Math.ceil((maxVal + range * 0.15) * 10) / 10

  // Determine how many chars fit per line based on bar count
  const charsPerLine = data.length <= 4 ? 16 : data.length <= 8 ? 10 : 8

  // Compute how many lines the tallest label needs, for X-axis height
  const maxLines = Math.max(
    ...data.map(d => wrapLabel(d.label, charsPerLine).length)
  )
  const xAxisHeight = maxLines * 14 + 20

  // Decide chart body based on chartType. Pie shares the same data
  // shape; bar + line share axis layout.
  const renderBody = () => {
    if (chartType === "pie") {
      const total = data.reduce((acc, d) => acc + d.value, 0) || 1
      return (
        <ResponsiveContainer width="100%" height={420}>
          <PieChart>
            <Tooltip
              formatter={(value: number | undefined, _name: any, ctx: any) => {
                const pct = (((value ?? 0) / total) * 100).toFixed(1)
                return [
                  `${formatValue(value ?? 0)} (${pct}%)`,
                  ctx?.payload?.label
                ]
              }}
              contentStyle={{
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
              }}
            />
            <Legend />
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              cx="50%"
              cy="50%"
              outerRadius={150}
              label={(entry: any) =>
                `${entry.label}: ${formatValue(Number(entry.value))}`
              }
            >
              {data.map((_, index) => (
                <Cell
                  key={`cell-${index}`}
                  fill={COLORS[index % COLORS.length]}
                />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      )
    }

    const sharedAxes = (
      <>
        <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
        <XAxis
          dataKey="label"
          tick={renderCustomTick(charsPerLine)}
          height={xAxisHeight}
          interval={0}
          tickLine={false}
        />
        <YAxis
          domain={[yMin, yMax]}
          tick={{ fontSize: 12 }}
          tickFormatter={formatValue}
          label={
            yAxisLabel
              ? {
                  value: yAxisLabel,
                  angle: -90,
                  position: "insideLeft",
                  style: { textAnchor: "middle", fontSize: 13 },
                  offset: -5
                }
              : undefined
          }
        />
        <Tooltip
          formatter={(value: number | undefined) => [
            formatValue(value ?? 0),
            yAxisLabel || "Value"
          ]}
          labelFormatter={(label: any) => String(label)}
          contentStyle={{
            borderRadius: "8px",
            border: "1px solid #e5e7eb",
            boxShadow: "0 2px 8px rgba(0,0,0,0.1)"
          }}
        />
      </>
    )

    if (chartType === "line") {
      return (
        <ResponsiveContainer width="100%" height={400 + xAxisHeight}>
          <LineChart
            data={data}
            margin={{
              top: 20,
              right: 30,
              left: yAxisLabel ? 20 : 10,
              bottom: 10
            }}
          >
            {sharedAxes}
            <Line
              type="monotone"
              dataKey="value"
              name={yAxisLabel || "Value"}
              stroke={COLORS[0]}
              strokeWidth={2.5}
              dot={{ r: 4 }}
              activeDot={{ r: 6 }}
            >
              <LabelList
                dataKey="value"
                position="top"
                formatter={((v: any) => formatValue(Number(v))) as any}
                style={{ fontSize: 11, fill: "#1f2937" }}
              />
            </Line>
          </LineChart>
        </ResponsiveContainer>
      )
    }

    // Default: bar chart (the existing renderer).
    return (
      <ResponsiveContainer width="100%" height={400 + xAxisHeight}>
        <BarChart
          data={data}
          margin={{
            top: 20,
            right: 30,
            left: yAxisLabel ? 20 : 10,
            bottom: 10
          }}
        >
          {sharedAxes}
          <Bar
            dataKey="value"
            name={yAxisLabel || "Value"}
            radius={[4, 4, 0, 0]}
            maxBarSize={80}
          >
            <LabelList
              dataKey="value"
              position="top"
              formatter={((v: any) => formatValue(Number(v))) as any}
              style={{ fontSize: 11, fill: "#1f2937" }}
            />
            {data.map((_, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    )
  }

  return (
    <div className="w-full rounded-lg border p-4">
      {chartTitle && (
        <h3 className="mb-4 text-center text-lg font-semibold">{chartTitle}</h3>
      )}
      {renderBody()}
    </div>
  )
}
