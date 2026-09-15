// Sketchfab writes materials with KHR_materials_pbrSpecularGlossiness, an
// extension three.js dropped support for. The loader does not fail on it, it
// just ignores the material body, so the model arrives as untextured white
// geometry. Rewriting the definitions to core pbrMetallicRoughness before the
// loader sees the bytes keeps the diffuse maps and needs no change to the asset.

const GLB_MAGIC = 0x46546c67
const GLB_VERSION = 2
const JSON_CHUNK = 0x4e4f534a
const BIN_CHUNK = 0x004e4942
const HEADER_BYTES = 12
const CHUNK_HEADER_BYTES = 8
const JSON_PAD = 0x20

export const SPEC_GLOSS = 'KHR_materials_pbrSpecularGlossiness'

const padding = (length) => (4 - (length % 4)) % 4

export function readGlb(buffer) {
  const view = new DataView(buffer)
  if (view.getUint32(0, true) !== GLB_MAGIC) {
    throw new Error('Not a binary glTF file')
  }

  const total = Math.min(view.getUint32(8, true), buffer.byteLength)
  let offset = HEADER_BYTES
  let json = null
  let bin = null

  while (offset + CHUNK_HEADER_BYTES <= total) {
    const length = view.getUint32(offset, true)
    const type = view.getUint32(offset + 4, true)
    const start = offset + CHUNK_HEADER_BYTES
    const chunk = new Uint8Array(buffer, start, length)

    if (type === JSON_CHUNK) json = JSON.parse(new TextDecoder().decode(chunk))
    else if (type === BIN_CHUNK) bin = chunk

    offset = start + length
  }

  if (!json) throw new Error('Binary glTF has no JSON chunk')
  return { json, bin }
}

export function writeGlb({ json, bin }) {
  const body = new TextEncoder().encode(JSON.stringify(json))
  const jsonPad = padding(body.length)
  const binPad = bin ? padding(bin.byteLength) : 0
  const binBytes = bin ? CHUNK_HEADER_BYTES + bin.byteLength + binPad : 0
  const total =
    HEADER_BYTES + CHUNK_HEADER_BYTES + body.length + jsonPad + binBytes

  const buffer = new ArrayBuffer(total)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint32(0, GLB_MAGIC, true)
  view.setUint32(4, GLB_VERSION, true)
  view.setUint32(8, total, true)

  let offset = HEADER_BYTES
  view.setUint32(offset, body.length + jsonPad, true)
  view.setUint32(offset + 4, JSON_CHUNK, true)
  bytes.set(body, offset + CHUNK_HEADER_BYTES)
  bytes.fill(
    JSON_PAD,
    offset + CHUNK_HEADER_BYTES + body.length,
    offset + CHUNK_HEADER_BYTES + body.length + jsonPad,
  )

  if (bin) {
    offset += CHUNK_HEADER_BYTES + body.length + jsonPad
    view.setUint32(offset, bin.byteLength + binPad, true)
    view.setUint32(offset + 4, BIN_CHUNK, true)
    bytes.set(bin, offset + CHUNK_HEADER_BYTES)
  }

  return buffer
}

// Specular-glossiness has no exact metallic-roughness equivalent. These models
// are dielectric leaves and bark, so treating them as fully non-metal and
// inverting glossiness is faithful enough and keeps the diffuse texture.
export function convertMaterial(material) {
  const specGloss = material.extensions?.[SPEC_GLOSS]
  if (!specGloss) return material

  const { diffuseFactor, diffuseTexture, glossinessFactor } = specGloss
  const next = {
    ...material,
    pbrMetallicRoughness: {
      ...material.pbrMetallicRoughness,
      metallicFactor: 0,
      roughnessFactor: 1 - (glossinessFactor ?? 1),
    },
  }
  if (diffuseFactor) next.pbrMetallicRoughness.baseColorFactor = diffuseFactor
  if (diffuseTexture) next.pbrMetallicRoughness.baseColorTexture = diffuseTexture

  const extensions = { ...material.extensions }
  delete extensions[SPEC_GLOSS]
  if (Object.keys(extensions).length > 0) next.extensions = extensions
  else delete next.extensions

  return next
}

const without = (list) =>
  Array.isArray(list) ? list.filter((name) => name !== SPEC_GLOSS) : list

export function convertSpecularGlossiness(buffer) {
  const { json, bin } = readGlb(buffer)
  if (!json.extensionsUsed?.includes(SPEC_GLOSS)) return buffer

  const next = {
    ...json,
    materials: (json.materials ?? []).map(convertMaterial),
    extensionsUsed: without(json.extensionsUsed),
    extensionsRequired: without(json.extensionsRequired),
  }
  if (next.extensionsUsed.length === 0) delete next.extensionsUsed
  if (next.extensionsRequired?.length === 0) delete next.extensionsRequired

  return writeGlb({ json: next, bin })
}
