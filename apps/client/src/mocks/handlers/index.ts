import { aktiviteHandlers } from "@/mocks/handlers/aktivite"
import { arsivHandlers } from "@/mocks/handlers/arsiv"
import { bildirimHandlers } from "@/mocks/handlers/bildirim"
import { bordroHandlers } from "@/mocks/handlers/bordro"
import { borcHandlers } from "@/mocks/handlers/borc"
import { authHandlers } from "@/mocks/handlers/auth"
import { buroHandlers } from "@/mocks/handlers/buro"
import { simulationHandler } from "@/mocks/handlers/common"
import { devHandlers } from "@/mocks/handlers/dev"
import { eBelgeHandlers } from "@/mocks/handlers/e-belge"
import { lucaHesapHandlers } from "@/mocks/handlers/luca-hesap"
import { evrakTalebiHandlers } from "@/mocks/handlers/evrak-talebi"
import { fisAktarimiHandlers } from "@/mocks/handlers/fis-aktarimi"
import { gorevHandlers } from "@/mocks/handlers/gorev"
import { kanalHandlers } from "@/mocks/handlers/kanal"
import { iceAktarimHandlers } from "@/mocks/handlers/ice-aktarim"
import { kasaHandlers } from "@/mocks/handlers/kasa"
import { mukellefHandlers } from "@/mocks/handlers/mukellef"
import { personelHandlers } from "@/mocks/handlers/personel"
import { portalHandlers } from "@/mocks/handlers/portal"
import { tahsilatHandlers } from "@/mocks/handlers/tahsilat"
import { tebligatHandlers } from "@/mocks/handlers/tebligat"
import { takvimHandlers } from "@/mocks/handlers/takvim"

/** Sıra önemli: simülasyon handler'ı her zaman ilk sırada kalmalı. */
export const handlers = [
  simulationHandler,
  ...devHandlers,
  ...authHandlers,
  ...buroHandlers,
  ...personelHandlers,
  ...mukellefHandlers,
  ...kasaHandlers,
  ...aktiviteHandlers,
  ...takvimHandlers,
  ...arsivHandlers,
  ...evrakTalebiHandlers,
  ...portalHandlers,
  ...gorevHandlers,
  ...eBelgeHandlers,
  ...lucaHesapHandlers,
  ...iceAktarimHandlers,
  ...fisAktarimiHandlers,
  ...tahsilatHandlers,
  ...tebligatHandlers,
  ...bordroHandlers,
  ...borcHandlers,
  ...kanalHandlers,
  ...bildirimHandlers,
]
