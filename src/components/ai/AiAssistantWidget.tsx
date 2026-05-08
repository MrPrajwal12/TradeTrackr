import { useMemo, useState } from "react"
import { Bot, Send, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { askAi } from "@/lib/ai"
import { cn } from "@/lib/utils"

type Msg = { role: "user" | "assistant"; text: string }

export function AiAssistantWidget() {
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [input, setInput] = useState("")
  const [messages, setMessages] = useState<Msg[]>([
    { role: "assistant", text: "Hi! Ask me anything about your trades, risk, or journaling." },
  ])

  const context = useMemo(() => {
    const last = messages.slice(-6)
    return last
      .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
      .join("\n")
  }, [messages])

  const send = async () => {
    const prompt = input.trim()
    if (!prompt || loading) return
    setInput("")
    setMessages((m) => [...m, { role: "user", text: prompt }])
    setLoading(true)
    try {
      const text = await askAi(`${context}\nUser: ${prompt}`)
      setMessages((m) => [...m, { role: "assistant", text: text || "No answer returned." }])
    } catch {
      setMessages((m) => [
        ...m,
        {
          role: "assistant",
          text: "AI isn’t configured yet. Make sure the Supabase Edge Function `ai` is deployed and the secret OPENAI_API_KEY is set in Supabase.",
        },
      ])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed bottom-4 right-4 z-[60]">
      {open ? (
        <Card className="w-[360px] shadow-xl border-border/60 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/70">
          <CardHeader className="py-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm flex items-center gap-2">
                <Bot className="size-4 text-primary" />
                TradeTrackr AI
              </CardTitle>
              <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)}>
                <X className="size-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="pt-0 pb-3">
            <div className="h-[320px] overflow-auto rounded-lg border bg-muted/20 p-3 space-y-2">
              {messages.map((m, idx) => (
                <div
                  key={idx}
                  className={cn(
                    "max-w-[90%] rounded-xl px-3 py-2 text-sm leading-relaxed",
                    m.role === "user"
                      ? "ml-auto bg-primary text-primary-foreground"
                      : "mr-auto bg-background border"
                  )}
                >
                  {m.text}
                </div>
              ))}
              {loading ? (
                <div className="mr-auto bg-background border rounded-xl px-3 py-2 text-sm text-muted-foreground">
                  Thinking…
                </div>
              ) : null}
            </div>

            <div className="mt-3 flex gap-2">
              <Input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your trades…"
                onKeyDown={(e) => {
                  if (e.key === "Enter") send()
                }}
                disabled={loading}
              />
              <Button size="icon" onClick={send} disabled={loading || !input.trim()}>
                <Send className="size-4" />
              </Button>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Uses a Supabase Edge Function so your API key isn’t exposed.
            </p>
          </CardContent>
        </Card>
      ) : (
        <Button
          onClick={() => setOpen(true)}
          className="h-12 w-12 rounded-full shadow-lg"
          aria-label="Open AI assistant"
        >
          <Bot className="size-5" />
        </Button>
      )}
    </div>
  )
}

