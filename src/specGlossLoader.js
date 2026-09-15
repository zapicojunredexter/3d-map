import { FileLoader } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { convertSpecularGlossiness } from './specGloss'

// GLTFLoader has no hook between fetching and parsing, so the translation has
// to replace load() outright. Everything else about the loader stays standard,
// which keeps it usable with useLoader and its cache.
export class SpecGlossGLTFLoader extends GLTFLoader {
  load(url, onLoad, onProgress, onError) {
    const loader = new FileLoader(this.manager)
    loader.setPath(this.path)
    loader.setResponseType('arraybuffer')
    loader.setRequestHeader(this.requestHeader)
    loader.setWithCredentials(this.withCredentials)

    loader.load(
      url,
      (buffer) => {
        try {
          this.parse(convertSpecularGlossiness(buffer), '', onLoad, onError)
        } catch (error) {
          if (onError) onError(error)
          else console.error(error)
          this.manager.itemError(url)
        }
      },
      onProgress,
      onError,
    )
  }
}
