import fs from 'node:fs'

const env = fs.readFileSync('.env', 'utf8')
const token = (env.match(/dhan_token="?([^"\r\n]+)/) || [])[1]
const envCid = (env.match(/dhan_cliend_id=(\d+)/) || env.match(/dhan_client_id=(\d+)/) || [])[1]
if (!token) {
  console.error('No dhan_token in .env')
  process.exit(1)
}

const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
const jwtCid = String(payload.dhanClientId || '')
console.log(
  JSON.stringify(
    {
      envCid,
      jwtCid,
      match: envCid === jwtCid,
      exp: new Date(payload.exp * 1000).toISOString(),
      tokenLen: token.length,
    },
    null,
    2
  )
)

async function hit(path, cid) {
  const r = await fetch(`https://api.dhan.co${path}`, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'access-token': token,
      'client-id': cid,
    },
  })
  const t = await r.text()
  let j
  try {
    j = JSON.parse(t)
  } catch {
    j = t.slice(0, 200)
  }
  const arr = Array.isArray(j) ? j : Array.isArray(j?.data) ? j.data : []
  const preview = arr.length
    ? JSON.stringify(arr[0]).slice(0, 220)
    : JSON.stringify(j).slice(0, 220)
  console.log(`${path} cid=${cid} status=${r.status} items=${arr.length} ${preview}`)
  return { status: r.status, items: arr.length, j, arr }
}

const withJwt = await hit('/v2/positions', jwtCid)
await hit('/v2/trades', jwtCid)
await hit('/v2/fundlimit', jwtCid)
if (envCid && envCid !== jwtCid) {
  await hit('/v2/positions', envCid)
  await hit('/v2/trades', envCid)
}

if (withJwt.arr?.length) {
  let realized = 0
  let unrealized = 0
  for (const p of withJwt.arr) {
    realized += Number(p.realizedProfit) || 0
    unrealized += Number(p.unrealizedProfit) || 0
  }
  console.log(JSON.stringify({ realized, unrealized, total: realized + unrealized }, null, 2))
}

const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })
for (const url of [
  `https://api.dhan.co/v2/ledger?from-date=${today}&to-date=${today}`,
  `https://api.dhan.co/v2/trades/${today}/${today}/0`,
  'https://api.dhan.co/v2/holdings',
]) {
  const r = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'access-token': token,
      'client-id': jwtCid,
    },
  })
  const t = await r.text()
  console.log(r.status, url.replace('https://api.dhan.co', ''), t.slice(0, 280))
}
