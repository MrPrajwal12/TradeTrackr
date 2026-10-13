import fs from 'node:fs'

const env = fs.readFileSync('.env', 'utf8')
const token = (
  env.match(/DHAN_ACCESS_TOKEN="?([^"\r\n]+)/) ||
  env.match(/dhan_token="?([^"\r\n]+)/) ||
  []
)[1]
if (!token) {
  console.error('No DHAN_ACCESS_TOKEN in .env')
  process.exit(1)
}
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
const cid = String(payload.dhanClientId)
const headers = {
  Accept: 'application/json',
  'Content-Type': 'application/json',
  'access-token': token,
  'client-id': cid,
}

const r = await fetch('https://api.dhan.co/v2/fundlimit', { headers })
const text = await r.text()
console.log('status', r.status)
console.log(text)

if (r.ok) {
  const j = JSON.parse(text)
  const available = Number(j.availabelBalance ?? j.availableBalance ?? 0)
  const sod = Number(j.sodLimit ?? 0)
  const utilized = Number(j.utilizedAmount ?? 0)
  const withdrawable = Number(j.withdrawableBalance ?? 0)
  // App default risk: ~30% of capital as monthly target path; max daily loss default was ~30% of starting? 
  // Onboarding: starting 4184, max daily 1255.2 ≈ 30% of capital
  const maxDailyLoss30 = available * 0.3
  const maxDailyLoss2 = available * 0.02
  const maxDailyLoss1 = available * 0.01
  console.log(
    JSON.stringify(
      {
        clientId: cid,
        availableBalance: available,
        sodLimit: sod,
        utilizedAmount: utilized,
        withdrawableBalance: withdrawable,
        suggestedMaxDailyLoss_30pct: Math.round(maxDailyLoss30 * 100) / 100,
        suggestedMaxDailyLoss_2pct: Math.round(maxDailyLoss2 * 100) / 100,
        suggestedMaxDailyLoss_1pct: Math.round(maxDailyLoss1 * 100) / 100,
      },
      null,
      2
    )
  )
}
