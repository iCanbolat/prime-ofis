/**
 * Zod'u Türkçe varsayılan hata mesajlarıyla yapılandırır. Şemalar `zod` yerine buradan import eder;
 * yalnızca tr paketi yüklenir (tüm diller bundle'a girmez).
 */
import { z } from "zod"
import tr from "zod/v4/locales/tr.js"

z.config(tr())

export { z }
