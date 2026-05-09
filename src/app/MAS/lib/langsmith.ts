export function assertLangSmithConfig(): void {
  if (process.env.NODE_ENV === "production") {
    if (!process.env.LANGCHAIN_API_KEY) {
      console.warn("[langsmith] LANGCHAIN_API_KEY not set — tracing disabled");
    }
  }
}
