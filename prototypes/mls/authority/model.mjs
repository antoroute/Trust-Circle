// C1g-2b laboratory ONLY. Candidate application rules, NOT a V3 wire contract,
// durable ledger, consensus protocol, QR implementation or production verifier.
// JWS serialization/signature verification is delegated to an existing library.
import { createHash, createPublicKey } from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(new URL('../../../backend/messaging/package.json', import.meta.url));
const { createSigner, createVerifier, createDecoder } = require('fast-jwt');
if (require('fast-jwt/package.json').version !== '6.3.3') {
  throw new Error('Review the laboratory against the pinned fast-jwt version first');
}
const decode = createDecoder({ complete: true });
export const MAX_WIRE = 16384;
const MAX_EVENTS = 256;
const MAX_DEVICES = 32;
const MAX_MEMBERS = 64;
const AUDIENCE = 'circlehaven-lab-authority-v0';
const typ = kind => `circlehaven-lab-${kind}+jwt`;
const fail = code => { throw new Error(code); };
const check = (condition, code = 'Rejected') => { if (!condition) fail(code); };
const exact = (value, keys) => {
  check(value && typeof value === 'object' && !Array.isArray(value));
  check(Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key)));
};
const id = value => check(typeof value === 'string' && /^[a-z0-9-]{1,64}$/.test(value));
const digest = value => check(typeof value === 'string' && /^[a-f0-9]{64}$/.test(value));
const count = value => check(Number.isSafeInteger(value) && value > 0);
const same = (left, right) => check(left === right, 'ContextMismatch');

function serialized(wire) {
  check(typeof wire === 'string' && wire.length <= MAX_WIRE, 'Limit');
  const parts = wire.split('.');
  check(parts.length === 3, 'Encoding');
  for (const part of parts) {
    check(/^[A-Za-z0-9_-]+$/.test(part), 'Encoding');
    same(Buffer.from(part, 'base64url').toString('base64url'), part);
  }
  const utf8 = new TextDecoder('utf-8', { fatal: true });
  utf8.decode(Buffer.from(parts[0], 'base64url'));
  utf8.decode(Buffer.from(parts[1], 'base64url'));
}

export function proofId(wire) {
  serialized(wire);
  return createHash('sha256').update(wire, 'ascii').digest('hex');
}

function peek(wire) {
  serialized(wire);
  // This parsed payload is only a lookup hint until verify() succeeds.
  const result = decode(wire);
  exact(result.header, ['alg', 'typ']); // No kid, jku, jwk, x5u, crit or discovery.
  same(result.header.alg, 'EdDSA');
  return result;
}

function publicKey(pem) {
  check(typeof pem === 'string' && pem.length <= 256);
  check(pem.startsWith('-----BEGIN PUBLIC KEY-----\n'));
  const key = createPublicKey(pem);
  same(key.asymmetricKeyType, 'ed25519'); // EdDSA alone also permits Ed448.
  same(key.export({ type: 'spki', format: 'pem' }), pem);
  return pem;
}

export function issue(privateKey, kind, payload) {
  // Test fixture writer only. Never export generated private keys to disk/logs.
  return createSigner({ key: privateKey, algorithm: 'EdDSA', typ: typ(kind), noTimestamp: true })({ aud: AUDIENCE, ...payload });
}

function verify(wire, key, kind) {
  const parsed = peek(wire);
  same(parsed.header.typ, typ(kind));
  const verified = createVerifier({ key: publicKey(key), algorithms: ['EdDSA'], cache: false })(wire);
  same(verified.aud, AUDIENCE);
  const { aud: _audience, ...claims } = verified;
  return claims;
}

function device(value) {
  exact(value, ['id', 'incarnation', 'key']);
  id(value.id); id(value.incarnation); publicKey(value.key);
}
const deviceId = value => `${value.id}/${value.incarnation}`;

export class Account {
  #environment; #account; #incarnation; #root; #head; #sequence = 0;
  #devices = new Map(); #seen = new Set(); #history = new Map();

  constructor(wire, anchor) {
    exact(anchor, ['environment', 'account', 'incarnation', 'digest']);
    id(anchor.environment); id(anchor.account); id(anchor.incarnation); digest(anchor.digest);
    // Caller must authenticate this anchor (OOB or explicit scoped delegation).
    // Constructing an Account is not itself a global trust decision.
    same(proofId(wire), anchor.digest);
    const hint = peek(wire).payload;
    device(hint.first);
    const p = verify(wire, hint.first.key, 'account-genesis');
    exact(p, ['environment', 'account', 'incarnation', 'first']);
    for (const name of ['environment', 'account', 'incarnation']) same(p[name], anchor[name]);
    this.#environment = p.environment; this.#account = p.account;
    this.#incarnation = p.incarnation; this.#root = this.#head = anchor.digest;
    this.#devices.set(deviceId(p.first), { ...p.first, active: true });
    this.#seen.add(anchor.digest);
    this.#history.set(this.#head, new Map(this.#devices));
  }

  get root() { return this.#root; }
  get head() { return this.#head; }
  get sequence() { return this.#sequence; }
  get environment() { return this.#environment; }
  get identity() { return { account: this.#account, incarnation: this.#incarnation }; }

  key(issuer) {
    check(typeof issuer === 'string');
    const found = this.#devices.get(issuer);
    check(found?.active, 'DeviceNotActive');
    return found.key;
  }

  keyAtKnownState(head, issuer) {
    // Public history already validated by THIS object, not an imported snapshot.
    // This proves an old binding, never current approval or creation time.
    digest(head);
    const snapshot = this.#history.get(head);
    check(snapshot, 'EvidenceRequired');
    const found = snapshot.get(issuer);
    check(found?.active, 'DeviceNotActive');
    return found.key;
  }

  apply(wire) {
    const hash = proofId(wire);
    if (this.#seen.has(hash)) return { duplicate: true };
    check(this.#sequence < MAX_EVENTS, 'Limit');
    const hint = peek(wire).payload;
    const p = verify(wire, this.key(hint.issuer), 'account-event');
    exact(p, ['environment', 'root', 'parent', 'sequence', 'issuer', 'action', 'target', 'possession']);
    same(p.environment, this.#environment); same(p.root, this.#root);
    same(p.parent, this.#head); same(p.sequence, this.#sequence + 1);
    let next;
    if (p.action === 'approve') {
      device(p.target);
      check(this.#devices.size < MAX_DEVICES, 'Limit');
      check(!this.#devices.has(deviceId(p.target)), 'DeviceReuse');
      check(![...this.#devices.values()].some(d => d.key === p.target.key), 'KeyReuse');
      const pop = verify(p.possession, p.target.key, 'device-possession');
      exact(pop, ['environment', 'root', 'parent', 'device', 'key']);
      same(pop.environment, this.#environment); same(pop.root, this.#root);
      same(pop.parent, this.#head); same(pop.device, deviceId(p.target));
      same(pop.key, p.target.key);
      next = { ...p.target, active: true };
    } else if (p.action === 'revoke') {
      same(p.possession, null);
      check(p.target !== p.issuer, 'SelfRevocationOutsideProbe');
      const target = this.#devices.get(p.target);
      check(target?.active, 'DeviceNotActive');
      next = { ...target, active: false };
    } else fail('UnsupportedAction');
    // No writes happen until every check succeeds. Memory only, not a DB commit.
    this.#devices.set(deviceId(next), next);
    this.#head = hash; this.#sequence++; this.#seen.add(hash);
    this.#history.set(hash, new Map(this.#devices));
    return { duplicate: false, action: p.action, root: this.#root, target: deviceId(next), proof: hash };
  }
}

export class TrustedAccounts {
  #accounts = new Map();
  constructor(accounts) { for (const account of accounts) this.trust(account); }
  trust(account) {
    check(account instanceof Account);
    check(!this.#accounts.has(account.root), 'AnchorAlreadyRegistered');
    check(this.#accounts.size < MAX_MEMBERS, 'Limit');
    // Explicit test stand-in for a new OOB trust decision, NOT server discovery.
    this.#accounts.set(account.root, account);
  }
  get(root) { return this.#accounts.get(root); }
  directRootsFor(account, environment) {
    id(environment);
    return [...this.#accounts.values()]
      .filter(a => a.identity.account === account && a.environment === environment).map(a => a.root);
  }
}

function accountFrom(accounts, root) {
  check(accounts instanceof TrustedAccounts, 'UntrustedRegistry');
  digest(root);
  const account = accounts.get(root);
  check(account instanceof Account && account.root === root, 'EvidenceRequired');
  return account;
}

function actor(wire, kind, accounts, environment, anchoredGenesis = false) {
  const hint = peek(wire).payload;
  const account = accountFrom(accounts, hint.issuerRoot);
  same(account.environment, environment);
  const historicalKey = account.keyAtKnownState(hint.accountHead, hint.issuerDevice);
  // Devices/keys cannot be reactivated or replaced under the same incarnation.
  // Active at both ends of this known linear history therefore preserves rights
  // across benign changes to OTHER devices. Unknown snapshots cannot enter here.
  if (!anchoredGenesis) same(account.key(hint.issuerDevice), historicalKey);
  const key = historicalKey;
  const p = verify(wire, key, kind);
  same(p.environment, environment);
  // A signed old parent is NOT evidence that the signature predates revocation:
  // current approval was checked above, and Circle separately checks current roles.
  return p;
}

export class Circle {
  #environment; #id; #generation; #root; #head; #sequence = 0; #owner; #accounts;
  #roles = new Map(); #seen = new Set(); #history = new Map(); #quarantined = false;

  constructor(wire, anchor, accounts) {
    exact(anchor, ['environment', 'circle', 'generation', 'digest']);
    id(anchor.environment); id(anchor.circle); id(anchor.generation); digest(anchor.digest);
    // Distinct accepted-context anchor: knowing a person's root does not prove
    // that their self-declared circle/owner claim is the circle we joined.
    same(proofId(wire), anchor.digest);
    // Only this exact already-anchored genesis may use a locally known old key.
    // Never use historical verification for an unknown operational request.
    const p = actor(wire, 'circle-genesis', accounts, anchor.environment, true);
    exact(p, ['environment', 'circle', 'generation', 'issuerRoot', 'issuerDevice', 'accountHead', 'members']);
    same(p.circle, anchor.circle); same(p.generation, anchor.generation);
    check(Array.isArray(p.members) && p.members.length > 0 && p.members.length <= MAX_MEMBERS, 'Limit');
    for (const member of p.members) {
      exact(member, ['root', 'role']);
      const account = accountFrom(accounts, member.root);
      same(account.environment, anchor.environment);
      check(!this.#roles.has(member.root), 'DuplicateIdentity');
      // Same human/account cannot be silently admitted with a replacement root.
      check(![...this.#roles.keys()].some(root => accountFrom(accounts, root).identity.account === account.identity.account), 'DuplicateIdentity');
      check(['owner', 'admin', 'member'].includes(member.role));
      this.#roles.set(member.root, member.role);
    }
    same(this.#roles.get(p.issuerRoot), 'owner');
    same([...this.#roles.values()].filter(r => r === 'owner').length, 1);
    this.#environment = p.environment; this.#id = p.circle;
    this.#generation = p.generation; this.#root = this.#head = anchor.digest;
    this.#accounts = accounts;
    this.#owner = p.issuerRoot; this.#seen.add(anchor.digest);
    this.#history.set(this.#head, 0);
  }

  get head() { return this.#head; }
  get sequence() { return this.#sequence; }
  get quarantined() { return this.#quarantined; }
  get context() { return { environment: this.#environment, circle: this.#id, generation: this.#generation, circleRoot: this.#root }; }

  #checkContext(p, currentParent = true) {
    same(p.environment, this.#environment); same(p.circle, this.#id);
    same(p.generation, this.#generation);
    if (currentParent) same(p.parent, this.#head);
    same(p.circleRoot, this.#root);
  }

  changeRole(wire, accounts) {
    check(!this.#quarantined, 'DivergenceDetected');
    check(accounts === this.#accounts, 'RegistryMismatch');
    const hash = proofId(wire);
    if (this.#seen.has(hash)) return { duplicate: true };
    check(this.#sequence < MAX_EVENTS, 'Limit');
    const p = actor(wire, 'role-event', accounts, this.#environment);
    exact(p, ['environment', 'circle', 'generation', 'circleRoot', 'parent', 'sequence', 'issuerRoot', 'issuerDevice', 'accountHead', 'targetRoot', 'role']);
    this.#checkContext(p, false);
    same(p.issuerRoot, this.#owner);
    check(this.#roles.has(p.targetRoot) && p.targetRoot !== this.#owner, 'RoleDenied');
    check(['member', 'admin'].includes(p.role), 'RoleDenied');
    // Membership/owner cannot change in this bounded model. A signed sibling
    // is therefore checkable against its known parent without trusting JSON roles.
    const priorSequence = this.#history.get(p.parent);
    check(priorSequence !== undefined, 'EvidenceRequired');
    same(p.sequence, priorSequence + 1);
    if (p.parent !== this.#head) {
      this.#quarantined = true;
      fail('DivergenceDetected');
    }
    this.#roles.set(p.targetRoot, p.role);
    this.#head = hash; this.#sequence++; this.#seen.add(hash);
    this.#history.set(hash, this.#sequence);
    return { duplicate: false };
  }

  authorizeRemoval(wire, accounts) {
    check(!this.#quarantined, 'DivergenceDetected');
    check(accounts === this.#accounts, 'RegistryMismatch');
    const p = actor(wire, 'removal-request', accounts, this.#environment);
    exact(p, ['environment', 'circle', 'generation', 'circleRoot', 'parent', 'issuerRoot', 'issuerDevice', 'accountHead', 'operation', 'action', 'targetRoot']);
    this.#checkContext(p); id(p.operation);
    same(p.action, 'remove-account-from-circle');
    check(['owner', 'admin'].includes(this.#roles.get(p.issuerRoot)), 'RoleDenied');
    check(this.#roles.has(p.targetRoot) && p.targetRoot !== this.#owner && p.targetRoot !== p.issuerRoot, 'TargetDenied');
    // Result is a local interpretation, NOT a portable trusted JSON credential.
    // Caller must retain/recheck original proofs; no durable obligation here.
    return Object.freeze({ ...this.context, targetRoot: p.targetRoot, proof: proofId(wire) });
  }

  checkReferent(root, accounts) {
    check(!this.#quarantined, 'DivergenceDetected');
    check(accounts === this.#accounts, 'RegistryMismatch');
    accountFrom(accounts, root); // Registry contains direct trust ONLY.
    check(['owner', 'admin'].includes(this.#roles.get(root)), 'RoleDenied');
  }

  attestIdentity(root, issuerDevice, subjectRoot, privateKey, accounts) {
    this.checkReferent(root, accounts);
    const issuer = accountFrom(accounts, root);
    issuer.key(issuerDevice);
    const subject = accountFrom(accounts, subjectRoot); // Must be directly verified by author.
    same(subject.environment, this.#environment);
    return issue(privateKey, 'identity-attestation', {
      ...this.context, parent: this.#head, issuerRoot: root, issuerDevice,
      accountHead: issuer.head, subjectRoot, subjectAccount: subject.identity.account,
      subjectIncarnation: subject.identity.incarnation, verification: 'direct',
    });
  }

  verifyIdentityAttestation(wire, referent, accounts) {
    this.checkReferent(referent, accounts);
    const p = actor(wire, 'identity-attestation', accounts, this.#environment);
    exact(p, [...Object.keys(this.context), 'parent', 'issuerRoot', 'issuerDevice', 'accountHead',
      'subjectRoot', 'subjectAccount', 'subjectIncarnation', 'verification']);
    this.#checkContext(p); same(p.issuerRoot, referent); same(p.verification, 'direct');
    digest(p.subjectRoot); id(p.subjectAccount); id(p.subjectIncarnation);
    check(p.subjectRoot !== referent, 'SelfAttestation');
    return p;
  }
}

// Separate from global direct trust and from Circle membership. No implicit
// admission, device approval or transitive delegation follows from this store.
export class IdentityDelegation {
  #circle; #accounts; #referent; #accepted = new Map();
  constructor(circle, accounts) {
    check(circle instanceof Circle && accounts instanceof TrustedAccounts);
    this.#circle = circle; this.#accounts = accounts;
  }
  delegate(referent) {
    check(!this.#referent || this.#referent === referent, 'ReferentReplacementOutsideProbe');
    this.#circle.checkReferent(referent, this.#accounts);
    this.#referent = referent; // Explicit local consent stand-in, no UI implemented.
  }
  #checkDirectConflict(p) {
    const roots = this.#accounts.directRootsFor(p.subjectAccount, this.#circle.context.environment);
    check(!roots.some(root => root !== p.subjectRoot), 'DirectIdentityConflict');
  }
  accept(wire, genesis, expectedIdentity) {
    check(this.#referent, 'DelegationRequired');
    const p = this.#circle.verifyIdentityAttestation(wire, this.#referent, this.#accounts);
    exact(expectedIdentity, ['account', 'incarnation']);
    same(p.subjectAccount, expectedIdentity.account); same(p.subjectIncarnation, expectedIdentity.incarnation);
    this.#checkDirectConflict(p);
    const previous = this.#accepted.get(p.subjectAccount);
    check(!previous || previous.root === p.subjectRoot, 'IdentityReplacementOutsideProbe');
    check(previous || this.#accepted.size < MAX_MEMBERS, 'Limit');
    const subject = new Account(genesis, {
      environment: p.environment, account: p.subjectAccount,
      incarnation: p.subjectIncarnation, digest: p.subjectRoot,
    });
    this.#accepted.set(p.subjectAccount, { root: subject.root, wire, proof: proofId(wire) });
    return this.status(p.subjectAccount);
  }
  hasStoredProof(account) { return this.#accepted.has(account); }
  status(account) {
    const stored = this.#accepted.get(account);
    check(stored, 'EvidenceRequired');
    // Do not silently erase evidence after a rights change. This conservative
    // recheck is a probe rule, not a decision about lifetime of past attestations.
    const directRoots = this.#accounts.directRootsFor(account, this.#circle.context.environment);
    if (directRoots.includes(stored.root)) {
      check(directRoots.length === 1, 'DirectIdentityConflict');
      return Object.freeze({ root: stored.root, provenance: 'direct' });
    }
    const p = this.#circle.verifyIdentityAttestation(stored.wire, this.#referent, this.#accounts);
    this.#checkDirectConflict(p);
    return Object.freeze({ root: stored.root, provenance: 'attested', referent: this.#referent,
      circleRoot: this.#circle.context.circleRoot, proof: stored.proof });
  }
}

// Candidate identity->MLS binding, independent of MLS parsing. The caller must
// separately verify the actual LeafNode/KeyPackage, PoP and MLS transition.
export class Binding {
  #context; #root; #device; #head = null; #version = 0; #credential; #key; #accounts;

  constructor(context, root, issuerDevice) {
    exact(context, ['environment', 'circle', 'generation', 'circleRoot', 'conversation', 'conversationGeneration']);
    for (const value of Object.values(context)) id(value);
    digest(context.circleRoot);
    digest(root); check(typeof issuerDevice === 'string' && issuerDevice.length <= 129);
    this.#context = { ...context }; this.#root = root; this.#device = issuerDevice;
  }

  get head() { return this.#head; }
  get version() { return this.#version; }

  accept(wire, accounts) {
    check(!this.#accounts || accounts === this.#accounts, 'RegistryMismatch');
    check(this.#version < MAX_EVENTS, 'Limit');
    const p = actor(wire, 'mls-binding', accounts, this.#context.environment);
    exact(p, [...Object.keys(this.#context), 'issuerRoot', 'issuerDevice', 'accountHead', 'previous', 'version', 'credential', 'key']);
    for (const [name, value] of Object.entries(this.#context)) same(p[name], value);
    same(p.issuerRoot, this.#root); same(p.issuerDevice, this.#device);
    same(p.previous, this.#head); count(p.version); same(p.version, this.#version + 1);
    check(typeof p.credential === 'string' && /^[a-f0-9]{2,512}$/.test(p.credential) && p.credential.length % 2 === 0);
    check(typeof p.key === 'string' && /^[a-f0-9]{64}$/.test(p.key));
    if (this.#head !== null) same(p.credential, this.#credential);
    this.#credential = p.credential; this.#key = p.key;
    this.#accounts = accounts;
    this.#head = proofId(wire); this.#version = p.version;
  }

  matches(credential, key, accounts) {
    check(accounts === this.#accounts, 'RegistryMismatch');
    // Recheck current approval even after a successful binding lookup.
    accountFrom(accounts, this.#root).key(this.#device);
    return this.#head !== null && this.#credential === credential && this.#key === key;
  }
}
