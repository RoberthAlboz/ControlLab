/**
 * Limitador simples em memória para tentativas de login.
 *  - por e-mail + IP: bloqueia depois de poucas falhas na mesma conta;
 *  - por IP (qualquer e-mail): bloqueia quem testa uma senha em muitas contas.
 * As entradas antigas são removidas sozinhas, sem depender de um timer.
 * (Em produção com várias instâncias, troque por um armazenamento compartilhado.)
 */
type Bucket = { failures: number; firstFailureAt: number; blockedUntil: number };

const PRUNE_THRESHOLD = 1_000;

export class LoginRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly blockMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
    private readonly maxFailuresPerIp = 30,
  ) {}

  private key(email: string, ip: string) {
    return `${email.trim().toLowerCase()}|${ip}`;
  }

  private ipKey(ip: string) {
    return `*|${ip}`;
  }

  private remainingSeconds(key: string) {
    const bucket = this.buckets.get(key);
    if (!bucket) return 0;
    const remaining = bucket.blockedUntil - this.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  /** Segundos restantes de bloqueio, ou 0 se a tentativa pode prosseguir. */
  retryAfterSeconds(email: string, ip: string) {
    return Math.max(this.remainingSeconds(this.key(email, ip)), this.remainingSeconds(this.ipKey(ip)));
  }

  private registerIn(key: string, limit: number, now: number) {
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.firstFailureAt > this.windowMs) {
      this.buckets.set(key, { failures: 1, firstFailureAt: now, blockedUntil: limit <= 1 ? now + this.blockMs : 0 });
      return;
    }
    bucket.failures += 1;
    if (bucket.failures >= limit) bucket.blockedUntil = now + this.blockMs;
  }

  registerFailure(email: string, ip: string) {
    const now = this.now();
    if (this.buckets.size > PRUNE_THRESHOLD) this.prune();
    this.registerIn(this.key(email, ip), this.maxFailures, now);
    this.registerIn(this.ipKey(ip), this.maxFailuresPerIp, now);
  }

  /** Sucesso zera só a conta: o contador por IP continua valendo contra varreduras. */
  registerSuccess(email: string, ip: string) {
    this.buckets.delete(this.key(email, ip));
  }

  /** Remove entradas antigas para não crescer indefinidamente. */
  prune() {
    const now = this.now();
    this.buckets.forEach((bucket, key) => {
      if (bucket.blockedUntil < now && now - bucket.firstFailureAt > this.windowMs) this.buckets.delete(key);
    });
  }

  /** Quantidade de entradas em memória (usado nos testes). */
  get size() {
    return this.buckets.size;
  }
}

export const loginRateLimiter = new LoginRateLimiter();
