import fs from 'node:fs'

const env = fs.readFileSync('.env', 'utf8')
const token = (env.match(/DHAN_ACCESS_TOKEN="?([^"\r\n]+)/) || [])[1]
const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString())
const cid = String(payload.dhanClientId)
console.log('before exp', new Date(payload.exp * 1000).toISOString())

const r = await fetch('https://api.dhan.co/v2/RenewToken', {
  method: 'GET',
  headers: {
    Accept: 'application/json',
    'access-token': token,
    dhanClientId: cid,
    'client-id': cid,
  },
})
const text = await r.text()
console.log('status', r.status)
console.log(text.slice(0, 500))
try {
  const j = JSON.parse(text)
  const nt = j.accessToken || j.access_token || j.data?.accessToken
  if (nt) {
    const p2 = JSON.parse(Buffer.from(nt.split('.')[1], 'base64url').toString())
    console.log('new exp', new Date(p2.exp * 1000).toISOString())
    console.log('new token len', nt.length)
  }
} catch {
  /* ignore */
}
