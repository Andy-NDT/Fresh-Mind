const sharp = require('sharp')
const { join } = require('path')
const { existsSync } = require('fs')

const SRC = join(__dirname, '..', 'resources', 'braincrop.png')
const OUT = join(__dirname, '..', 'resources', 'tray-icon.png')

const ELLIPSE_W_RATIO = 0.86
const ELLIPSE_H_RATIO = 0.66
const TARGET = 32

async function build() {
  if (!existsSync(SRC)) {
    console.warn(`Skipping tray-icon: ${SRC} not found yet (run prep-brain-crop first)`)
    return
  }

  const meta = await sharp(SRC).metadata()
  const W = meta.width
  const H = meta.height

  const rx = (W * ELLIPSE_W_RATIO) / 2
  const ry = (H * ELLIPSE_H_RATIO) / 2
  const cx = W / 2
  const cy = H / 2

  const maskSvg = Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">` +
    `<ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="white"/>` +
    `</svg>`
  )

  const masked = await sharp(SRC)
    .composite([{ input: maskSvg, blend: 'dest-in' }])
    .png()
    .toBuffer()

  const trimmed = await sharp(masked).trim().toBuffer({ resolveWithObject: true })
  const trimW = trimmed.info.width
  const trimH = trimmed.info.height

  const scale = TARGET / Math.max(trimW, trimH)
  const newW = Math.max(1, Math.round(trimW * scale))
  const newH = Math.max(1, Math.round(trimH * scale))

  const padLeft = Math.floor((TARGET - newW) / 2)
  const padRight = TARGET - newW - padLeft
  const padTop = Math.floor((TARGET - newH) / 2)
  const padBottom = TARGET - newH - padTop

  await sharp(trimmed.data)
    .resize(newW, newH, { kernel: 'lanczos3' })
    .extend({
      top: padTop,
      bottom: padBottom,
      left: padLeft,
      right: padRight,
      background: { r: 0, g: 0, b: 0, alpha: 0 }
    })
    .png({ compressionLevel: 9 })
    .toFile(OUT)

  console.log(`tray-icon.png ready (${TARGET}x${TARGET}, brain-only ellipse ${trimW}x${trimH} -> ${newW}x${newH})`)
}

build().catch(e => { console.error(e); process.exit(1) })
