/**
 * Limitador simples em memória para tentativas de login.
 * Bloqueia temporariamente depois de várias falhas para o mesmo e-mail + IP.
 * (Em produção com várias instâncias, troque por um armazenamento compartilhado.)
 */
type Bucket = { failures: number; firstFailureAt: number; blockedUntil: number };

export class LoginRateLimiter {
  private buckets = new Map<string, Bucket>();

  constructor(
    private readonly maxFailures = 5,
    private readonly windowMs = 15 * 60 * 1000,
    private readonly blockMs = 15 * 60 * 1000,
    private readonly now: () => number = Date.now,
  ) {}

  private key(email: string, ip: string) {
    return `${email.trim().toLowerCase()}|${ip}`;
  }

  /** Segundos restantes de bloqueio, ou 0 se a tentativa pode prosseguir. */
  retryAfterSeconds(email: string, ip: string) {
    const bucket = this.buckets.get(this.key(email, ip));
    if (!bucket) return 0;
    const remaining = bucket.blockedUntil - this.now();
    return remaining > 0 ? Math.ceil(remaining / 1000) : 0;
  }

  registerFailure(email: string, ip: string) {
    const key = this.key(email, ip);
    const now = this.now();
    const bucket = this.buckets.get(key);
    if (!bucket || now - bucket.firstFailureAt > this.windowMs) {
      this.buckets.set(key, { failures: 1, firstFailureAt: now, blockedUntil: 0 });
      return;
    }
    bucket.failures += 1;
    if (bucket.failures >= this.maxFailures) bucket.blockedUntil = now + this.blockMs;
  }

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
}

export const loginRateLimiter = new LoginRateLimiter();
