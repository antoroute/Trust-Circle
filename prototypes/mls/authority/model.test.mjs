import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync, randomBytes, sign } from 'node:crypto';
import { createRequire } from 'node:module';
import { Account, TrustedAccounts, Circle, Binding, IdentityDelegation, issue, proofId, MAX_WIRE } from './model.mjs';

const require = createRequire(new URL('../../../backend/messaging/package.json', import.meta.url));
const { createSigner, createVerifier } = require('fast-jwt');
const ENV = 'synthetic-env';
const keys = () => {
  const pair = generateKeyPairSync('ed25519');
  return {
    private: pair.privateKey.export({ type: 'pkcs8', format: 'pem' }),
    public: pair.publicKey.export({ type: 'spki', format: 'pem' }),
  };
};
const keyDevice = (id = 'phone', incarnation = 'one') => {
  const key = keys();
  return { key, value: { id, incarnation, key: key.public }, id: `${id}/${incarnation}` };
};
function person(name, incarnation = 'one', environment = ENV) {
  const first = keyDevice();
  const genesis = issue(first.key.private, 'account-genesis', {
    environment, account: name, incarnation, first: first.value,
  });
  const anchor = { environment, account: name, incarnation, digest: proofId(genesis) };
  return { first, genesis, anchor, account: new Account(genesis, anchor) };
}
function setup() {
  const people = [person('owner'), person('admin'), person('member'), person('target')];
  const accounts = new TrustedAccounts(people.map(p => p.account));
  const [owner] = people;
  const payload = {
    environment: ENV, circle: 'circle-a', generation: 'one',
    issuerRoot: owner.account.root, issuerDevice: owner.first.id, accountHead: owner.account.head,
    members: people.map((p, i) => ({ root: p.account.root, role: ['owner', 'admin', 'member', 'member'][i] })),
  };
  const genesis = issue(owner.first.key.private, 'circle-genesis', payload);
  const anchor = { environment: ENV, circle: 'circle-a', generation: 'one', digest: proofId(genesis) };
  return { people, accounts, genesis, anchor, circle: new Circle(genesis, anchor, accounts) };
}
function request(f, author = f.people[1], extra = {}, key = author.first.key.private) {
  const payload = {
    ...f.circle.context, parent: f.circle.head,
    issuerRoot: author.account.root, issuerDevice: author.first.id, accountHead: author.account.head,
    operation: 'remove-target', action: 'remove-account-from-circle', targetRoot: f.people[3].account.root,
    ...extra,
  };
  return { payload, wire: issue(key, 'removal-request', payload) };
}
function role(f, target, value, extra = {}, author = f.people[0]) {
  return issue(author.first.key.private, 'role-event', {
    ...f.circle.context, parent: f.circle.head, sequence: f.circle.sequence + 1,
    issuerRoot: author.account.root, issuerDevice: author.first.id, accountHead: author.account.head,
    targetRoot: target.account.root, role: value, ...extra,
  });
}
function approval(p, target = keyDevice('desktop'), extra = {}) {
  const pop = issue(target.key.private, 'device-possession', {
    environment: ENV, root: p.account.root, parent: p.account.head,
    device: target.id, key: target.key.public,
  });
  const payload = {
    environment: ENV, root: p.account.root, parent: p.account.head, sequence: p.account.sequence + 1,
    issuer: p.first.id, action: 'approve', target: target.value, possession: pop, ...extra,
  };
  return { target, payload, wire: issue(p.first.key.private, 'account-event', payload) };
}
function revoke(p, target, issuer = p.first, extra = {}) {
  return issue(issuer.key.private, 'account-event', {
    environment: ENV, root: p.account.root, parent: p.account.head, sequence: p.account.sequence + 1,
    issuer: issuer.id, action: 'revoke', target: target.id, possession: null, ...extra,
  });
}
function binding(f, p = f.people[1], conversation = 'private-a', extra = {}, signer = p.first) {
  const context = { ...f.circle.context, conversation, conversationGeneration: 'one' };
  const payload = {
    ...context, issuerRoot: p.account.root, issuerDevice: signer.id, accountHead: p.account.head,
    previous: null, version: 1, credential: '010203', key: randomBytes(32).toString('hex'), ...extra,
  };
  return { context, payload, wire: issue(signer.key.private, 'mls-binding', payload) };
}
const rejects = (fn, pattern) => assert.throws(fn, pattern);

test('explicit account and context anchors are both necessary; no self-declared owner trust', () => {
  const f = setup();
  const impostor = person('owner');
  rejects(() => new Account(impostor.genesis, f.people[0].anchor), /ContextMismatch/);
  rejects(() => new Account(f.people[0].genesis, { ...f.people[0].anchor, account: 'other' }));
  const forged = setup();
  rejects(() => new Circle(forged.genesis, f.anchor, forged.accounts));
  rejects(() => new Circle(f.genesis, { ...f.anchor, generation: 'two' }, f.accounts));
  const missing = new TrustedAccounts(f.people.slice(1).map(p => p.account));
  rejects(() => new Circle(f.genesis, f.anchor, missing), /EvidenceRequired/);
  assert.equal(f.circle.authorizeRemoval(request(f).wire, f.accounts).targetRoot, f.people[3].account.root);
});

test('actual signature authenticates issuer, not server roles, keys or headers', () => {
  const f = setup();
  const good = request(f);
  assert.ok(f.circle.authorizeRemoval(good.wire, f.accounts));
  rejects(() => f.circle.authorizeRemoval(request(f, f.people[1], {}, keys().private).wire, f.accounts));
  rejects(() => f.circle.authorizeRemoval(request(f, f.people[2], { role: 'admin' }).wire, f.accounts));
  rejects(() => f.circle.authorizeRemoval(request(f, f.people[2]).wire, f.accounts), /RoleDenied/);
  const changed = good.wire.split('.');
  changed[1] = Buffer.from(JSON.stringify({ ...good.payload, targetRoot: f.people[2].account.root })).toString('base64url');
  rejects(() => f.circle.authorizeRemoval(changed.join('.'), f.accounts));
  assert.ok(f.circle.authorizeRemoval(good.wire, f.accounts));
});

test('promotion cannot retroactively authorize the exact previously denied request', () => {
  const f = setup(); const member = f.people[2];
  const old = request(f, member);
  rejects(() => f.circle.authorizeRemoval(old.wire, f.accounts), /RoleDenied/);
  f.circle.changeRole(role(f, member, 'admin'), f.accounts);
  rejects(() => f.circle.authorizeRemoval(old.wire, f.accounts), /ContextMismatch/);
  assert.ok(f.circle.authorizeRemoval(request(f, member).wire, f.accounts));
});

test('demotion rejects old signed parent and a freshly signed backdated parent', () => {
  const f = setup(); const admin = f.people[1];
  const old = request(f); assert.ok(f.circle.authorizeRemoval(old.wire, f.accounts));
  const parent = f.circle.head;
  f.circle.changeRole(role(f, admin, 'member'), f.accounts);
  rejects(() => f.circle.authorizeRemoval(old.wire, f.accounts), /ContextMismatch/);
  const freshBackdated = request(f, admin, { parent, operation: 'signed-after-demotion' });
  rejects(() => f.circle.authorizeRemoval(freshBackdated.wire, f.accounts), /ContextMismatch/);
  rejects(() => f.circle.authorizeRemoval(request(f).wire, f.accounts), /RoleDenied/);
  // No hold/ledger exists here; rejection must NOT be interpreted as unlocking one.
});

test('role changes require previous owner authority, exact parent and no owner replacement', () => {
  const f = setup(); const before = f.circle.head;
  for (const author of [f.people[1], f.people[2]]) {
    rejects(() => f.circle.changeRole(role(f, f.people[2], 'admin', {}, author), f.accounts));
    assert.equal(f.circle.head, before);
  }
  rejects(() => f.circle.changeRole(role(f, f.people[0], 'member'), f.accounts));
  rejects(() => f.circle.changeRole(role(f, f.people[2], 'owner'), f.accounts));
  rejects(() => f.circle.changeRole(role(f, f.people[2], 'admin', { sequence: 99 }), f.accounts));
  const valid = role(f, f.people[2], 'admin');
  f.circle.changeRole(valid, f.accounts);
  assert.deepEqual(f.circle.changeRole(valid, f.accounts), { duplicate: true });
});

test('missing parent can be supplied and the exact request retried without ratchet/side effect', () => {
  const f = setup(); const lagging = new Circle(f.genesis, f.anchor, f.accounts);
  const transition = role(f, f.people[2], 'admin');
  f.circle.changeRole(transition, f.accounts);
  const req = request(f, f.people[2]);
  rejects(() => lagging.authorizeRemoval(req.wire, f.accounts), /ContextMismatch/);
  assert.equal(lagging.head, f.anchor.digest);
  lagging.changeRole(transition, f.accounts);
  assert.deepEqual(lagging.authorizeRemoval(req.wire, f.accounts), f.circle.authorizeRemoval(req.wire, f.accounts));
});

test('signed siblings are a known conflict, not authority to choose or merge branches', () => {
  const f = setup(); const other = new Circle(f.genesis, f.anchor, f.accounts);
  const one = role(f, f.people[2], 'admin');
  const two = role(f, f.people[1], 'member');
  f.circle.changeRole(one, f.accounts); other.changeRole(two, f.accounts);
  rejects(() => f.circle.changeRole(two, f.accounts), /DivergenceDetected/);
  rejects(() => other.changeRole(one, f.accounts), /DivergenceDetected/);
  assert.notEqual(f.circle.head, other.head);
  assert.equal(f.circle.quarantined, true);
  rejects(() => f.circle.authorizeRemoval(request(f).wire, f.accounts), /DivergenceDetected/);
  rejects(() => f.circle.changeRole(role(f, f.people[2], 'member'), f.accounts), /DivergenceDetected/);
});

test('counterexample: a valid prefix cannot reveal a withheld demotion or unseen fork', () => {
  const f = setup(); const hidden = new Circle(f.genesis, f.anchor, f.accounts);
  const oldParent = f.circle.head;
  f.circle.changeRole(role(f, f.people[1], 'member'), f.accounts);
  const attacker = request(f, f.people[1], { parent: oldParent, operation: 'after-hidden-demotion' });
  rejects(() => f.circle.authorizeRemoval(attacker.wire, f.accounts));
  assert.ok(hidden.authorizeRemoval(attacker.wire, f.accounts)); // LIMIT, not a success guarantee.
});

test('approval is signed by an active device and requires scoped new-key possession', () => {
  const p = person('alice'); const next = approval(p);
  rejects(() => p.account.key(next.target.id), /DeviceNotActive/);
  const fakePop = issue(keys().private, 'device-possession', {
    environment: ENV, root: p.account.root, parent: p.account.head,
    device: next.target.id, key: next.target.key.public,
  });
  const head = p.account.head;
  rejects(() => p.account.apply(issue(p.first.key.private, 'account-event', { ...next.payload, possession: fakePop })));
  rejects(() => p.account.apply(next.payload.possession)); // PoP alone is not approval.
  assert.equal(p.account.head, head);
  p.account.apply(next.wire);
  assert.equal(p.account.key(next.target.id), next.target.key.public);
  assert.deepEqual(p.account.apply(next.wire), { duplicate: true });
});

test('an approved second device can approve another without giving a circle admin that right', () => {
  const p = person('alice'); const desktop = approval(p); p.account.apply(desktop.wire);
  const third = approval({ ...p, first: desktop.target }, keyDevice('tablet'));
  p.account.apply(third.wire);
  assert.equal(p.account.key(third.target.id), third.target.key.public);
  const stranger = person('admin'); const next = approval(p, keyDevice('fourth'));
  rejects(() => p.account.apply(issue(stranger.first.key.private, 'account-event', next.payload)));
});

test('revoked device, reused incarnation and reused public key cannot approve or regain authority', () => {
  const p = person('alice'); const next = approval(p); p.account.apply(next.wire);
  const revokeWire = revoke(p, next.target);
  const accepted = p.account.apply(revokeWire);
  assert.equal(accepted.action, 'revoke'); assert.equal(accepted.target, next.target.id);
  rejects(() => p.account.key(next.target.id), /DeviceNotActive/);
  rejects(() => p.account.apply(approval({ ...p, first: next.target }, keyDevice('tablet')).wire), /DeviceNotActive/);
  rejects(() => p.account.apply(approval(p, next.target).wire), /DeviceReuse/);
  const sameKey = { ...next.target, id: 'desktop/two', value: { ...next.target.value, incarnation: 'two' } };
  rejects(() => p.account.apply(approval(p, sameKey).wire), /KeyReuse/);
  const replacement = approval(p, keyDevice('desktop', 'two')); p.account.apply(replacement.wire);
  assert.equal(p.account.key(replacement.target.id), replacement.target.key.public);
});

test('account state is bound without invalidating a continuously approved signer for a benign addition', () => {
  const f = setup(); const admin = f.people[1]; const old = request(f);
  const desktop = approval(admin); admin.account.apply(desktop.wire);
  assert.ok(f.circle.authorizeRemoval(old.wire, f.accounts));
  assert.ok(f.circle.authorizeRemoval(request(f).wire, f.accounts));
  admin.account.apply(revoke(admin, admin.first, desktop.target));
  rejects(() => f.circle.authorizeRemoval(request(f).wire, f.accounts), /DeviceNotActive/);
  const second = { ...admin, first: desktop.target };
  assert.ok(f.circle.authorizeRemoval(request(f, second).wire, f.accounts));
});

test('account-chain missing events, siblings and environments are not silently accepted', () => {
  const p = person('alice'); const lagging = new Account(p.genesis, p.anchor);
  const first = approval(p); const sibling = approval(p, keyDevice('tablet'));
  p.account.apply(first.wire); const second = approval(p, keyDevice('extra'));
  rejects(() => lagging.apply(second.wire), /ContextMismatch/);
  lagging.apply(first.wire); lagging.apply(second.wire);
  rejects(() => lagging.apply(sibling.wire), /ContextMismatch/);
  // Account forks are refused but do not yet latch an account-wide quarantine.
  assert.equal(lagging.key(p.first.id), p.first.key.public);
  const bad = approval(p, keyDevice('bad'), { environment: 'another-env' });
  rejects(() => p.account.apply(bad.wire), /ContextMismatch/);
});

test('root replacement does not inherit old roles even with the same account name', () => {
  const f = setup(); const newAdmin = person('admin', 'two');
  f.accounts.trust(newAdmin.account); // Simulated NEW OOB check, not inherited trust.
  rejects(() => f.circle.authorizeRemoval(request(f, newAdmin).wire, f.accounts), /RoleDenied/);
  const oldAsNew = request(f, newAdmin, { issuerRoot: f.people[1].account.root });
  rejects(() => f.circle.authorizeRemoval(oldAsNew.wire, f.accounts));
  const absent = new TrustedAccounts(f.people.filter((_, i) => i !== 1).map(p => p.account));
  rejects(() => f.circle.authorizeRemoval(request(f).wire, absent), /RegistryMismatch/);
});

test('scope and target are exact; account withdrawal is not a leaf index or global device revoke', () => {
  const f = setup();
  for (const extra of [
    { environment: 'other-env' }, { circle: 'other-circle' }, { generation: 'two' },
    { targetRoot: f.people[0].account.root }, { targetRoot: f.people[1].account.root },
    { targetRoot: '1' }, { action: 'revoke-device' }, { action: 'add-account' },
    { conversation: 'private' },
  ]) rejects(() => f.circle.authorizeRemoval(request(f, f.people[1], extra).wire, f.accounts));
});

test('independent requests at one authority head do not claim global order or durable replay protection', () => {
  const f = setup();
  const one = request(f); const two = request(f, f.people[0], { targetRoot: f.people[2].account.root });
  const accepted1 = f.circle.authorizeRemoval(one.wire, f.accounts);
  const accepted2 = f.circle.authorizeRemoval(two.wire, f.accounts);
  assert.notEqual(accepted1.proof, accepted2.proof);
  assert.deepEqual(f.circle.authorizeRemoval(one.wire, f.accounts), accepted1);
  assert.equal(f.circle.head, f.anchor.digest); // No requests ledger or removal executed.
});

test('device identity can bind distinct MLS keys across contexts without sharing their secrets', () => {
  const f = setup(); const p = f.people[1];
  const a = binding(f, p, 'private-a'); const b = binding(f, p, 'private-b');
  const localA = new Binding(a.context, p.account.root, p.first.id);
  const localB = new Binding(b.context, p.account.root, p.first.id);
  localA.accept(a.wire, f.accounts); localB.accept(b.wire, f.accounts);
  assert.ok(localA.matches(a.payload.credential, a.payload.key, f.accounts));
  assert.ok(localB.matches(b.payload.credential, b.payload.key, f.accounts));
  assert.equal(localA.matches(b.payload.credential, b.payload.key, f.accounts), false);
  rejects(() => new Binding(b.context, p.account.root, p.first.id).accept(a.wire, f.accounts));
  const desktop = approval(p); p.account.apply(desktop.wire);
  p.account.apply(revoke(p, p.first, desktop.target));
  rejects(() => localA.matches(a.payload.credential, a.payload.key, f.accounts), /DeviceNotActive/);
  rejects(() => localB.matches(b.payload.credential, b.payload.key, f.accounts), /DeviceNotActive/);
});

test('binding succession is signed, context-specific and cannot relabel credential or replace identity', () => {
  const f = setup(); const p = f.people[1]; const first = binding(f, p);
  const local = new Binding(first.context, p.account.root, p.first.id); local.accept(first.wire, f.accounts);
  const oldKey = first.payload.key;
  const next = binding(f, p, 'private-a', { previous: local.head, version: 2 });
  const wrong = binding(f, p, 'private-a', { ...next.payload, credential: '04' });
  rejects(() => local.accept(wrong.wire, f.accounts));
  const version = local.version;
  for (const extra of [{ previous: null }, { version: 1 }, { conversationGeneration: 'two' }]) {
    rejects(() => local.accept(binding(f, p, 'private-a', { ...next.payload, ...extra }).wire, f.accounts));
    assert.equal(local.version, version);
  }
  local.accept(next.wire, f.accounts);
  assert.equal(local.matches(first.payload.credential, oldKey, f.accounts), false);
  assert.ok(local.matches(next.payload.credential, next.payload.key, f.accounts));
  rejects(() => local.accept(first.wire, f.accounts));
});

test('envelope separation rejects access JWT, foreign proof types, key URLs and algorithm confusion', () => {
  const f = setup(); const admin = f.people[1]; const { payload } = request(f);
  for (const kind of ['account-event', 'device-possession', 'role-event', 'mls-binding']) {
    rejects(() => f.circle.authorizeRemoval(issue(admin.first.key.private, kind, payload), f.accounts));
  }
  for (const header of [{ typ: 'JWT' }, { kid: 'admin' }, { jku: 'https://example.invalid/keys' }, { crit: ['x'], x: true }]) {
    const wire = createSigner({ key: admin.first.key.private, algorithm: 'EdDSA', noTimestamp: true,
      typ: 'circlehaven-lab-removal-request+jwt', header })(payload);
    rejects(() => f.circle.authorizeRemoval(wire, f.accounts));
  }
  const hmac = createSigner({ key: 'synthetic-hmac-only', algorithm: 'HS256', noTimestamp: true,
    typ: 'circlehaven-lab-removal-request+jwt' })(payload);
  rejects(() => f.circle.authorizeRemoval(hmac, f.accounts));
  rejects(() => f.circle.authorizeRemoval(request(f, admin, { aud: 'another-application' }).wire, f.accounts));
});

test('signature encoding aliases are rejected before hashing or verification', () => {
  const f = setup(); const good = request(f).wire;
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const last = alphabet.indexOf(good.at(-1));
  const alias = good.slice(0, -1) + alphabet[last + 1];
  assert.deepEqual(Buffer.from(alias.split('.')[2], 'base64url'), Buffer.from(good.split('.')[2], 'base64url'));
  assert.ok(createVerifier({ key: f.people[1].first.key.public, algorithms: ['EdDSA'] })(alias));
  rejects(() => proofId(alias), /ContextMismatch/);
  rejects(() => f.circle.authorizeRemoval(alias, f.accounts), /ContextMismatch/);
  assert.ok(f.circle.authorizeRemoval(good, f.accounts));
});

test('bounded input and exact schemas reject oversized, malformed and unexpected fields', () => {
  const f = setup();
  for (const wire of ['', 'a.b.c', 'a..b', 'a.b.c.d', request(f).wire + '=', 'x'.repeat(MAX_WIRE + 1)]) {
    rejects(() => f.circle.authorizeRemoval(wire, f.accounts));
  }
  for (const extra of [{ operation: 1 }, { operation: 'x'.repeat(65) }, { serverRole: 'admin' }, { exp: 1 }, { targetRoot: null }]) {
    rejects(() => f.circle.authorizeRemoval(request(f, f.people[1], extra).wire, f.accounts));
  }
  const payload = request(f).payload;
  delete payload.operation;
  rejects(() => f.circle.authorizeRemoval(issue(f.people[1].first.key.private, 'removal-request', payload), f.accounts));
});

test('schema key names cannot be merged by embedding the comparison delimiter', () => {
  const f = setup(); const b = binding(f); const p = f.people[1];
  const context = { ...b.context, 'circle,conversation': 'a' };
  delete context.circle; delete context.conversation;
  rejects(() => new Binding(context, p.account.root, p.first.id));
});

test('Ed448 keys are rejected despite using the same polymorphic EdDSA identifier', () => {
  const pair = generateKeyPairSync('ed448');
  const first = { id: 'phone', incarnation: 'one', key: pair.publicKey.export({ type: 'spki', format: 'pem' }) };
  const wire = issue(pair.privateKey.export({ type: 'pkcs8', format: 'pem' }), 'account-genesis', {
    environment: ENV, account: 'alice', incarnation: 'one', first,
  });
  rejects(() => new Account(wire, { environment: ENV, account: 'alice', incarnation: 'one', digest: proofId(wire) }), /ContextMismatch/);
});

test('bounded device and event collections fail closed while exact event duplicates remain idempotent', () => {
  const p = person('alice');
  for (let i = 1; i < 32; i++) p.account.apply(approval(p, keyDevice(`device-${i}`)).wire);
  const head = p.account.head;
  rejects(() => p.account.apply(approval(p, keyDevice('one-too-many')).wire), /Limit/);
  assert.equal(p.account.head, head);
  const f = setup(); let last;
  for (let i = 0; i < 256; i++) {
    last = role(f, f.people[2], i % 2 ? 'member' : 'admin');
    f.circle.changeRole(last, f.accounts);
  }
  rejects(() => f.circle.changeRole(role(f, f.people[2], 'admin'), f.accounts), /Limit/);
  assert.deepEqual(f.circle.changeRole(last, f.accounts), { duplicate: true });
});

test('identity attestations cannot act as removal requests, roles or device approvals', () => {
  const f = setup(); const owner = f.people[0];
  const statement = issue(owner.first.key.private, 'identity-attestation', {
    issuerRoot: owner.account.root, targetRoot: f.people[2].account.root,
  });
  rejects(() => f.circle.changeRole(statement, f.accounts));
  rejects(() => f.circle.authorizeRemoval(statement, f.accounts));
  rejects(() => f.people[2].account.apply(statement));
  // The positive attestation path has a separate consumer and cannot grant these rights.
});

function delegatedSetup() {
  const f = setup();
  const subject = person('new-person'); // OUTSIDE the initial circle and direct registry.
  const authorAccounts = new TrustedAccounts([...f.people.map(p => p.account), subject.account]);
  const authorCircle = new Circle(f.genesis, f.anchor, authorAccounts);
  const referent = f.people[1];
  const delegation = new IdentityDelegation(f.circle, f.accounts);
  const attest = () => authorCircle.attestIdentity(referent.account.root, referent.first.id,
    subject.account.root, referent.first.key.private, authorAccounts);
  const payload = extra => ({
    ...f.circle.context, parent: f.circle.head, issuerRoot: referent.account.root,
    issuerDevice: referent.first.id, accountHead: referent.account.head,
    subjectRoot: subject.account.root, subjectAccount: subject.account.identity.account,
    subjectIncarnation: subject.account.identity.incarnation, verification: 'direct', ...extra,
  });
  return { ...f, subject, authorAccounts, authorCircle, referent, delegation, attest, payload };
}
const acceptIdentity = (f, wire = f.attest()) => f.delegation.accept(wire, f.subject.genesis, f.subject.account.identity);

test('explicit delegated verification accepts an initially unknown outsider with scoped provenance only', () => {
  const f = delegatedSetup(); const root = f.subject.account.root;
  assert.equal(f.accounts.get(root), undefined);
  rejects(() => acceptIdentity(f), /DelegationRequired/);
  f.delegation.delegate(f.referent.account.root);
  const result = acceptIdentity(f);
  assert.equal(result.provenance, 'attested'); assert.equal(result.root, root);
  assert.equal(result.referent, f.referent.account.root); assert.equal(result.circleRoot, f.anchor.digest);
  assert.equal(f.accounts.get(root), undefined); // NOT promoted to direct/global trust.
  rejects(() => f.circle.authorizeRemoval(request(f, f.subject).wire, f.accounts), /EvidenceRequired/);
  rejects(() => f.circle.changeRole(role(f, f.subject, 'admin'), f.accounts), /RoleDenied/);
  const b = binding(f, f.subject);
  rejects(() => new Binding(b.context, root, f.subject.first.id).accept(b.wire, f.accounts), /EvidenceRequired/);
});

test('honest attestation writer requires direct verification, not an attested chain', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); acceptIdentity(f);
  rejects(() => f.circle.attestIdentity(f.referent.account.root, f.referent.first.id,
    f.subject.account.root, f.referent.first.key.private, f.accounts), /EvidenceRequired/);
  rejects(() => f.delegation.delegate(f.subject.account.root), /ReferentReplacementOutsideProbe/);
  const another = new IdentityDelegation(f.circle, f.accounts);
  rejects(() => another.delegate(f.subject.account.root), /EvidenceRequired/);
});

test('a mere member or another directly verified admin cannot substitute for the selected referent', () => {
  const f = delegatedSetup();
  rejects(() => f.delegation.delegate(f.people[2].account.root), /RoleDenied/);
  f.delegation.delegate(f.referent.account.root);
  const owner = f.people[0];
  const ownerProof = f.authorCircle.attestIdentity(owner.account.root, owner.first.id,
    f.subject.account.root, owner.first.key.private, f.authorAccounts);
  rejects(() => acceptIdentity(f, ownerProof), /ContextMismatch/);
  rejects(() => f.delegation.delegate(owner.account.root), /ReferentReplacementOutsideProbe/);
});

test('attestation binds exact subject, incarnation, environment, circle root and direct assertion', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root);
  for (const extra of [
    { environment: 'another' }, { circle: 'another' }, { circleRoot: 'a'.repeat(64) },
    { generation: 'two' }, { subjectAccount: 'another' }, { subjectIncarnation: 'two' },
    { subjectRoot: f.people[2].account.root }, { verification: 'attested' }, { role: 'admin' },
  ]) {
    rejects(() => acceptIdentity(f, issue(f.referent.first.key.private, 'identity-attestation', f.payload(extra))));
    assert.equal(f.delegation.hasStoredProof('new-person'), false);
  }
  rejects(() => acceptIdentity(f, issue(keys().private, 'identity-attestation', f.payload({}))));
  assert.equal(acceptIdentity(f).provenance, 'attested');
});

test('a conflicting direct identity cannot be overwritten by a valid referent signature', () => {
  const f = delegatedSetup(); const impostor = person('new-person', 'two');
  f.accounts.trust(impostor.account);
  f.delegation.delegate(f.referent.account.root);
  rejects(() => acceptIdentity(f), /DirectIdentityConflict/);
  assert.equal(f.delegation.hasStoredProof('new-person'), false);
  assert.equal(f.accounts.get(impostor.account.root), impostor.account);
});

test('a direct conflict learned after acceptance invalidates use but keeps the attestation evidence', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); acceptIdentity(f);
  f.accounts.trust(person('new-person', 'two').account);
  rejects(() => f.delegation.status('new-person'), /DirectIdentityConflict/);
  assert.equal(f.delegation.hasStoredProof('new-person'), true);
});

test('a directly verified account in another environment does not contaminate local trust', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root);
  f.accounts.trust(person('new-person', 'one', 'other-environment').account);
  assert.equal(acceptIdentity(f).provenance, 'attested');
  assert.equal(f.delegation.status('new-person').root, f.subject.account.root);
});

test('a replaced attested root does not inherit earlier delegation without a new verification flow', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); acceptIdentity(f);
  const replacement = person('new-person', 'two');
  const wire = issue(f.referent.first.key.private, 'identity-attestation', f.payload({
    subjectRoot: replacement.account.root, subjectIncarnation: 'two',
  }));
  rejects(() => f.delegation.accept(wire, replacement.genesis, replacement.account.identity), /IdentityReplacementOutsideProbe/);
  assert.equal(f.delegation.status('new-person').root, f.subject.account.root);
});

test('direct verification stays direct and does not depend on the later status of a referent', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); acceptIdentity(f);
  f.accounts.trust(f.subject.account); // Separate explicit OOB decision.
  assert.equal(f.delegation.status('new-person').provenance, 'direct');
  f.circle.changeRole(role(f, f.referent, 'member'), f.accounts);
  assert.equal(f.delegation.status('new-person').provenance, 'direct');
});

test('known referent demotion refuses new attestations while preserving previously received evidence', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); const wire = f.attest();
  acceptIdentity(f, wire);
  f.circle.changeRole(role(f, f.referent, 'member'), f.accounts);
  rejects(() => acceptIdentity(f, wire), /RoleDenied/);
  rejects(() => f.delegation.status('new-person'), /RoleDenied/);
  assert.equal(f.delegation.hasStoredProof('new-person'), true);
});

test('known referent device revocation cannot be bypassed by an old attestation or historical key lookup', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); const wire = f.attest();
  acceptIdentity(f, wire);
  const oldHead = f.referent.account.head;
  const next = approval(f.referent); f.referent.account.apply(next.wire);
  f.referent.account.apply(revoke(f.referent, f.referent.first, next.target));
  assert.equal(f.referent.account.keyAtKnownState(oldHead, f.referent.first.id), f.referent.first.key.public);
  rejects(() => acceptIdentity(f, wire), /DeviceNotActive/);
  rejects(() => f.delegation.status('new-person'), /DeviceNotActive/);
  assert.ok(f.delegation.hasStoredProof('new-person'));
});

test('counterexample: a compromised referent can lie about having personally verified someone', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root);
  // Bypass the honest writer: signature proves the assertion, NOT a real QR scan.
  const lie = issue(f.referent.first.key.private, 'identity-attestation', f.payload({}));
  assert.equal(acceptIdentity(f, lie).provenance, 'attested');
});

test('an anchored historical genesis can be checked without restoring revoked operational rights', () => {
  const f = setup(); const owner = f.people[0]; const firstHead = owner.account.head;
  const next = approval(owner); owner.account.apply(next.wire);
  owner.account.apply(revoke(owner, owner.first, next.target));
  const currentHead = owner.account.head;
  const reconstructed = new Circle(f.genesis, f.anchor, f.accounts);
  assert.equal(owner.account.head, currentHead); // Historical read does not change current state.
  rejects(() => reconstructed.authorizeRemoval(request(f, owner, { accountHead: firstHead }).wire, f.accounts), /DeviceNotActive/);
  const activeOwner = { ...owner, first: next.target };
  assert.ok(reconstructed.authorizeRemoval(request({ ...f, circle: reconstructed }, activeOwner).wire, f.accounts));
  rejects(() => owner.account.keyAtKnownState('a'.repeat(64), owner.first.id), /EvidenceRequired/);
});

test('known device history permits delayed role events after a benign addition, never after issuer revocation', () => {
  const f = setup(); const oldRole = role(f, f.people[2], 'admin');
  const owner = f.people[0]; owner.account.apply(approval(owner).wire);
  f.circle.changeRole(oldRole, f.accounts);
  assert.equal(f.circle.quarantined, false);
  assert.ok(f.circle.authorizeRemoval(request(f, f.people[2]).wire, f.accounts));
  const later = role(f, f.people[1], 'member');
  const next = approval(owner, keyDevice('next')); owner.account.apply(next.wire);
  owner.account.apply(revoke(owner, owner.first, next.target));
  const head = f.circle.head;
  rejects(() => f.circle.changeRole(later, f.accounts), /DeviceNotActive/);
  assert.equal(f.circle.head, head);
});

test('a device approved later cannot claim authority from a parent where it did not exist', () => {
  const f = setup(); const admin = f.people[1]; const beforeApproval = admin.account.head;
  const next = approval(admin); admin.account.apply(next.wire);
  const asNext = { ...admin, first: next.target };
  rejects(() => f.circle.authorizeRemoval(request(f, asNext, { accountHead: beforeApproval }).wire, f.accounts), /DeviceNotActive/);
  assert.ok(f.circle.authorizeRemoval(request(f, asNext).wire, f.accounts));
  rejects(() => f.circle.authorizeRemoval(request(f, asNext, { accountHead: 'a'.repeat(64) }).wire, f.accounts), /EvidenceRequired/);
});

test('benign changes to other devices preserve a cached attestation, without bypassing signer revocation', () => {
  const f = delegatedSetup(); f.delegation.delegate(f.referent.account.root); acceptIdentity(f);
  const next = approval(f.referent); f.referent.account.apply(next.wire);
  assert.equal(f.delegation.status('new-person').provenance, 'attested');
  f.referent.account.apply(revoke(f.referent, next.target));
  assert.equal(f.delegation.status('new-person').provenance, 'attested');
});

test('only an authorized signed sibling of a known parent installs the memory divergence guard', () => {
  const f = setup(); const parent = f.circle.head;
  const validSibling = role(f, f.people[1], 'member');
  f.circle.changeRole(role(f, f.people[2], 'admin'), f.accounts);
  for (const wire of [
    role(f, f.people[1], 'member', { parent, sequence: 1 }, f.people[2]),
    role(f, f.people[1], 'member', { parent: 'a'.repeat(64) }),
    role(f, f.people[1], 'member', { parent, sequence: 99 }),
    role(f, f.people[0], 'member', { parent, sequence: 1 }),
  ]) {
    rejects(() => f.circle.changeRole(wire, f.accounts));
    assert.equal(f.circle.quarantined, false);
  }
  rejects(() => f.circle.changeRole(validSibling, f.accounts), /DivergenceDetected/);
  rejects(() => new IdentityDelegation(f.circle, f.accounts).delegate(f.people[0].account.root), /DivergenceDetected/);
  rejects(() => f.circle.authorizeRemoval(request(f).wire, f.accounts), /DivergenceDetected/);
});

test('A2: an old removal stays non-executable; a fresh authorized proof does not magically clear a hold', () => {
  const f = setup(); const old = request(f);
  const obligation = f.circle.authorizeRemoval(old.wire, f.accounts);
  f.circle.changeRole(role(f, f.people[1], 'member'), f.accounts);
  rejects(() => f.circle.authorizeRemoval(old.wire, f.accounts));
  const confirmed = f.circle.authorizeRemoval(request(f, f.people[0]).wire, f.accounts);
  assert.equal(confirmed.targetRoot, obligation.targetRoot);
  assert.notEqual(confirmed.proof, obligation.proof);
  // No obligation/confirmation link or hold resolver yet; both remain future work.
  assert.equal(obligation.targetRoot, f.people[3].account.root);
});

test('bindings include circle genesis, not just reusable names and generation labels', () => {
  const f = setup(); const owner = f.people[0]; const p = f.people[1];
  const differentGenesis = issue(owner.first.key.private, 'circle-genesis', {
    environment: ENV, circle: 'circle-a', generation: 'one',
    issuerRoot: owner.account.root, issuerDevice: owner.first.id, accountHead: owner.account.head,
    members: f.people.map((person, i) => ({ root: person.account.root, role: i ? 'member' : 'owner' })),
  });
  const other = new Circle(differentGenesis, { ...f.anchor, digest: proofId(differentGenesis) }, f.accounts);
  assert.notEqual(other.context.circleRoot, f.circle.context.circleRoot);
  const b = binding(f, p);
  rejects(() => new Binding({ ...b.context, ...other.context }, p.account.root, p.first.id).accept(b.wire, f.accounts));
});

test('a known account revocation cannot be bypassed by substituting an older local registry', () => {
  const f = setup(); const admin = f.people[1]; const old = request(f);
  const b = binding(f, admin); const local = new Binding(b.context, admin.account.root, admin.first.id);
  local.accept(b.wire, f.accounts);
  const desktop = approval(admin); admin.account.apply(desktop.wire);
  admin.account.apply(revoke(admin, admin.first, desktop.target));
  rejects(() => f.circle.authorizeRemoval(old.wire, f.accounts), /DeviceNotActive/);
  const stale = new Account(admin.genesis, admin.anchor);
  rejects(() => f.accounts.trust(stale), /AnchorAlreadyRegistered/);
  const replacement = new TrustedAccounts(f.people.map((p, i) => i === 1 ? stale : p.account));
  rejects(() => f.circle.authorizeRemoval(old.wire, replacement), /RegistryMismatch/);
  rejects(() => local.matches(b.payload.credential, b.payload.key, replacement), /RegistryMismatch/);
  // Recreating the ENTIRE memory world loses knowledge: no durable anti-rollback claim.
  const restarted = new Circle(f.genesis, f.anchor, replacement);
  assert.ok(restarted.authorizeRemoval(old.wire, replacement));
});

test('JSON duplicate-name policy is explicit last-wins, not a cross-language canonical JSON claim', () => {
  const f = setup(); const member = f.people[2];
  // Test-only raw standard JWS input to exercise the library parser, not a production writer.
  const p = { aud: 'circlehaven-lab-authority-v0', ...request(f, member).payload };
  const header = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'circlehaven-lab-removal-request+jwt' })).toString('base64url');
  const json = JSON.stringify(p).replace('"issuerRoot":', `"issuerRoot":"${f.people[1].account.root}","issuerRoot":`);
  const input = `${header}.${Buffer.from(json).toString('base64url')}`;
  const wire = `${input}.${sign(null, Buffer.from(input), member.first.key.private).toString('base64url')}`;
  rejects(() => f.circle.authorizeRemoval(wire, f.accounts), /RoleDenied/);
});

test('fixture envelope sizes are recorded separately from any latency or platform claim', t => {
  const f = setup(); const p = f.people[1]; const next = approval(p);
  const sizes = {
    accountGenesis: Buffer.byteLength(p.genesis),
    circleGenesisFourAccounts: Buffer.byteLength(f.genesis),
    deviceApprovalIncludingPossession: Buffer.byteLength(next.wire),
    roleChange: Buffer.byteLength(role(f, f.people[2], 'admin')),
    removalRequest: Buffer.byteLength(request(f).wire),
    mlsBinding: Buffer.byteLength(binding(f).wire),
  };
  for (const value of Object.values(sizes)) assert.ok(value < MAX_WIRE);
  t.diagnostic(`Synthetic envelope bytes (not full proof chain): ${JSON.stringify(sizes)}`);
});
