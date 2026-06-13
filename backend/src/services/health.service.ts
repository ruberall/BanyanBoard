import type { HealthRepository } from '../repositories/health.repository';

export class HealthService {
  constructor(private readonly repo: HealthRepository) {}

  async check(): Promise<{ status: string }> {
    await this.repo.ping();
    return { status: 'ok' };
  }
}
