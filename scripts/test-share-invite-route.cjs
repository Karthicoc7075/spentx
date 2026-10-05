// Unit-test the real handler with auth/database/email boundaries mocked.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const ts = require('typescript');
const token = '40000000-0000-4000-8000-000000000001';
const source = fs.readFileSync('src/app/api/send-email/route.ts', 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
async function request({ user = { id: 'owner' }, share = { id: 'share', viewer_email: 'viewer@example.test', expires_at: null }, link = { purpose_name: '<private>', expires_at: null }, reserved = true, body = { token } } = {}) {
  const sent = [];
  const filters = [];
  const supabase = {
    auth: { getUser: async () => ({ data: { user }, error: null }) },
    from(table) {
      const query = { select() { return this; }, eq(k,v) { filters.push([table,k,v]); return this; }, neq() { return this; }, maybeSingle: async () => ({ data: table === 'purpose_shares' ? share : link, error: null }) };
      return query;
    },
  };
  const exports = {};
  const dependencies = {
    'next/server': { NextResponse: { json: (body, options) => Response.json(body, options) } },
    '@/lib/resend': { sendResendEmail: async (mail) => { sent.push(mail); return { id: 'mail' }; } },
    '@/lib/server/with-route-logging': { withRouteLogging: (_, __, handler) => handler },
    '@/lib/supabase/server': { createClient: async () => supabase },
    '@/lib/supabase/admin': { createAdminClient: () => ({ rpc: async () => ({ data: reserved, error: null }) }) },
    '@/lib/auth-redirect': { getServerSiteOrigin: () => 'https://spentx.example' },
  };
  vm.runInNewContext(js, { exports, require: (name) => { assert.ok(dependencies[name], name); return dependencies[name]; }, URL, Date, console });
  const response = await exports.POST(new Request('https://spentx.example/api/send-email', { method: 'POST', body: JSON.stringify(body) }));
  return { response, sent, filters };
}
(async () => {
  for (const [options, status] of [
    [{ user: null }, 401], [{ body: { to: 'victim', html: 'arbitrary' } }, 400],
    [{ share: null }, 404], [{ link: null }, 404],
    [{ share: { id: 'share', viewer_email: 'viewer@example.test', expires_at: '2000-01-01' } }, 404],
    [{ reserved: false }, 429],
  ]) {
    const result = await request(options);
    assert.equal(result.response.status, status);
    assert.equal(result.sent.length, 0);
  }
  const result = await request({ body: { token, to: 'attacker@example.test', html: '<script>bad</script>', shareUrl: 'https://attacker.example' } });
  assert.equal(result.response.status, 200);
  assert.equal(result.sent[0].to, 'viewer@example.test');
  assert.ok(result.sent[0].html.includes('&lt;private&gt;'));
  assert.ok(result.sent[0].html.includes(`https://spentx.example/share/${token}`));
  assert.ok(!result.sent[0].html.includes('attacker'));
  assert.ok(result.filters.some(([table,key,value]) => table === 'purpose_shares' && key === 'owner_id' && value === 'owner'));
  console.log('Invitation route: 7 cases passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
