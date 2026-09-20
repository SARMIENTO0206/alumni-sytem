const base = 'http://localhost:3000';

async function login() {
  const res = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'alumni', password: 'alumni123' })
  });
  return res.json();
}

async function ask(token, query, conversationId) {
  const res = await fetch(`${base}/api/ai/assistant`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ query, conversationId })
  });
  return res.json();
}

const auth = await login();
let cid;
const turns = [
  'Paano mag request ng transcript?',
  'ano kailangan?',
  'saan ko makikita?',
  'di ko gets yung processing',
  'ah okay'
];
for (const query of turns) {
  const data = await ask(auth.token, query, cid);
  cid = data.conversationId;
  console.log('\nUSER:', query);
  console.log('TOPIC/INTENT/LANG:', data.topic, data.intent, data.language);
  console.log('AI:', String(data.text || data.response || '').replace(/<br>/g, '\n'));
}

const hist = await fetch(`${base}/api/ai/conversations/${cid}`, {
  headers: { Authorization: `Bearer ${auth.token}` }
}).then((r) => r.json());
console.log('\nStored messages:', (hist.messages || []).length);
