import { supabase } from "@/lib/supabase"

export async function askAi(prompt: string, context?: unknown) {
  const { data, error } = await supabase.functions.invoke("ai", {
    body: context ? { prompt, context } : { prompt },
  })
  if (error) throw error
  return (data as { text?: string } | null)?.text ?? ""
}

