/**
 * Prove whether Dhan /v2/positions requires access-token.
 * Run: node scripts/test-dhan-auth.mjs
 */
import fs from 'node:fs'

const env = fs.readFileSync('.env', 'utf8')
const token = (
  env.match(/DHAN_ACCESS_TOKEN="?([^"\r\n]+)/) ||
  env.match(/dhan_token="?([^"\r\n]+)/) ||
  []
)[1]
const envCid = (
  env.match(/DHAN_CLIENT_ID=(\d+)/) ||
  env.match(/dhan_client_id=(\d+)/) ||
  env.match(/dhan_cliend_id=(\d+)/) ||
  []
)[1]

function jwtClientId(jwt) {
  try {
    const payload = JSON.parse(
      Buffer.from(jwt.split('.')[1], 'base64url').toString()
    )
    return String(payload.dhanClientId || '')
  } catch {
    return ''
  }
}

const cid = (token && jwtClientId(token)) || envCid || ''

async function call(label, headers) {
  const r = await fetch('https://api.dhan.co/v2/positions', {
    method: 'GET',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...headers,
    },
  })
  const text = await r.text()
  let body
  try {
    body = JSON.parse(text)
  } catch {
    body = text.slice(0, 300)
  }
  const summary =
    typeof body === 'object' && body
      ? {
          errorType: body.errorType,
          errorCode: body.errorCode,
          errorMessage: body.errorMessage,
          items: Array.isArray(body) ? body.length : undefined,
        }
      : { raw: String(body).slice(0, 200) }
  console.log(`\n=== ${label} ===`)
  console.log('HTTP', r.status)
  console.log(JSON.stringify(summary, null, 2))
  return { status: r.status, body }
}

console.log(
  JSON.stringify(
    {
      hasToken: Boolean(token),
      tokenLen: token?.length || 0,
      clientId: cid,
    },
    null,
    2
  )
)

// 1) No auth at all
await call('NO headers (no token, no client-id)', {})

// 2) Client ID only
if (cid) {
  await call('client-id ONLY (no access-token)', { 'client-id': cid })
}

// 3) Token only
if (token) {
  await call('access-token ONLY (no client-id)', { 'access-token': token })
}

// 4) Both (correct)
if (token && cid) {
  await call('access-token + client-id (correct)', {
    'access-token': token,
    'client-id': cid,
  })
}

console.log('\nDone.')
