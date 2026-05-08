import { supabase } from "@/lib/supabase"

export async function askAi(prompt: string) {
  const { data, error } = await supabase.functions.invoke("ai", {
    body: { prompt },
  })
  if (error) throw error
  return (data as { text?: string } | null)?.text ?? ""
}

