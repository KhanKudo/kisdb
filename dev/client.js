// import { Observable, element } from "dynamics"
import { createVanillaViewer } from "../viewer/vanilla"
import { createHttpClient } from "../client/http"

// var __forceLoader = element()
// __forceLoader = __forceLoader

window.DB = createVanillaViewer(createHttpClient())