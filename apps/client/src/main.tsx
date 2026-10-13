import { StrictMode } from "react"
import { createRoot } from "react-dom/client"

import "./index.css"
import { App } from "@/app/app"

// Varsayılan gerçek API'dir (geliştirmede Vite proxy → apps/api). Mock API yalnızca açıkça istenince.
const mocksEnabled = import.meta.env.VITE_ENABLE_MOCKS === "true"

async function enableMocking() {
  if (!mocksEnabled) return
  const { worker } = await import("@/mocks/browser")
  await worker.start({
    onUnhandledRequest(request, print) {
      // Yalnızca karşılanmamış API isteklerini uyar; statik dosyalar/HMR sessizce geçer.
      if (new URL(request.url).pathname.startsWith("/api/")) print.warning()
    },
  })
}

enableMocking().then(() => {
  createRoot(document.getElementById("root")!).render(
    <StrictMode>
      <App />
    </StrictMode>
  )
})
