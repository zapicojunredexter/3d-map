import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import {
  SPEC_GLOSS,
  convertMaterial,
  convertSpecularGlossiness,
  readGlb,
  writeGlb,
} from './specGloss'

const TREE = 'assets/simple_low_poly_tree.glb'

function asArrayBuffer(path) {
  const file = readFileSync(path)
  return file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength)
}

describe('convertMaterial', () => {
  it('moves the diffuse texture onto base colour and drops the extension', () => {
    const converted = convertMaterial({
      name: 'Leaf',
      doubleSided: true,
      extensions: {
        [SPEC_GLOSS]: {
          diffuseFactor: [1, 1, 1, 1],
          diffuseTexture: { index: 3, texCoord: 0 },
          glossinessFactor: 0.2,
        },
      },
    })

    expect(converted.extensions).toBeUndefined()
    expect(converted.doubleSided).toBe(true)
    expect(converted.pbrMetallicRoughness).toEqual({
      metallicFactor: 0,
      roughnessFactor: 0.8,
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 3, texCoord: 0 },
    })
  })

  it('keeps other extensions and leaves plain materials untouched', () => {
    const material = {
      extensions: { [SPEC_GLOSS]: { glossinessFactor: 1 }, KHR_other: {} },
    }
    expect(convertMaterial(material).extensions).toEqual({ KHR_other: {} })

    const plain = { name: 'plain', pbrMetallicRoughness: { metallicFactor: 1 } }
    expect(convertMaterial(plain)).toBe(plain)
  })
})

describe('glb container', () => {
  it('round-trips without touching the binary payload', () => {
    const original = readGlb(asArrayBuffer(TREE))
    const rebuilt = readGlb(writeGlb(original))

    expect(rebuilt.json).toEqual(original.json)
    expect(rebuilt.bin.byteLength).toBe(original.bin.byteLength)
    // Buffer.equals, because a 3 MB deep-equal takes tens of seconds.
    expect(Buffer.from(rebuilt.bin).equals(Buffer.from(original.bin))).toBe(true)
  })

  it('pads the json chunk so the binary chunk stays 4-byte aligned', () => {
    const buffer = writeGlb({
      json: { asset: { version: '2.0' } },
      bin: new Uint8Array([1, 2, 3]),
    })

    expect(buffer.byteLength % 4).toBe(0)
    // A glb chunk length counts its own padding, so 3 bytes occupy 4.
    const { bin } = readGlb(buffer)
    expect(bin.byteLength).toBe(4)
    expect([...bin.subarray(0, 3)]).toEqual([1, 2, 3])
  })

  it('rejects anything that is not a glb', () => {
    expect(() => readGlb(new ArrayBuffer(16))).toThrow(/not a binary gltf/i)
  })
})

describe('convertSpecularGlossiness', () => {
  it('leaves a file alone when the extension is absent', () => {
    const buffer = writeGlb({ json: { asset: { version: '2.0' } }, bin: null })
    expect(convertSpecularGlossiness(buffer)).toBe(buffer)
  })

  it('gives every tree material a base colour texture three can see', () => {
    const source = asArrayBuffer(TREE)
    expect(readGlb(source).json.extensionsRequired).toContain(SPEC_GLOSS)

    const { json } = readGlb(convertSpecularGlossiness(source))
    expect(json.extensionsRequired).toBeUndefined()
    expect(json.extensionsUsed).toBeUndefined()
    expect(json.materials).toHaveLength(2)

    for (const material of json.materials) {
      expect(material.extensions, material.name).toBeUndefined()
      const pbr = material.pbrMetallicRoughness
      expect(pbr.metallicFactor).toBe(0)
      expect(pbr.roughnessFactor).toBeGreaterThan(0.5)
      expect(json.textures[pbr.baseColorTexture.index]).toBeTruthy()
    }
  })

  // jsdom has no URL.createObjectURL, so the embedded pngs cannot decode here.
  // This covers the parse itself; the textures are checked in the browser.
  it('parses into the bark and leaf meshes', async () => {
    const gltf = await new Promise((resolve, reject) => {
      new GLTFLoader().parse(
        convertSpecularGlossiness(asArrayBuffer(TREE)),
        '',
        resolve,
        reject,
      )
    })

    const meshes = []
    gltf.scene.traverse((object) => {
      if (object.isMesh) meshes.push(object)
    })

    expect(meshes).toHaveLength(2)
    for (const mesh of meshes) {
      expect(mesh.material.metalness).toBe(0)
      expect(mesh.material.roughness).toBeGreaterThan(0.5)
    }
  })
})
