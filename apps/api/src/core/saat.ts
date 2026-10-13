import { Injectable } from "@nestjs/common"

/**
 * Uygulamanın "şimdi"si. Servisler `new Date()` yerine bunu kullanır; testler
 * `saat.sabitle(...)` ile zamanı dondurur (takvim, süre ve gece işi kuralları tarihe bağlı).
 */
@Injectable()
export class Saat {
  private sabit: Date | null = null

  simdi(): Date {
    return this.sabit ? new Date(this.sabit) : new Date()
  }

  simdiIso(): string {
    return this.simdi().toISOString()
  }

  sabitle(an: Date | string | null): void {
    this.sabit = an === null ? null : new Date(an)
  }
}
