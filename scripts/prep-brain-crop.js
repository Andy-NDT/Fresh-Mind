const sharp = require('sharp')
const { join } = require('path')

const SRC = join(__dirname, '..', 'resources', 'brain.png')
const CROP = join(__dirname, '..', 'resources', 'braincrop.png')
const SHARED = join(__dirname, '..', 'src', 'renderer', 'shared', 'brain.png')

const INNER_RATIO = 0.80

async function build() {
  const meta = await sharp(SRC).metadata()
  const side = Math.floor(Math.min(meta.width, meta.height) * INNER_RATIO)
  const left = Math.floor((meta.width - side) / 2)
  const top = Math.floor((meta.height - side) / 2)

  const buffer = await sharp(SRC)
    .extract({ left, top, width: side, height: side })
    .png({ compressionLevel: 9 })
    .toBuffer()

  await sharp(buffer).toFile(CROP)
  await sharp(buffer).toFile(SHARED)

  console.log(`braincrop.png: ${meta.width}x${meta.height} -> ${side}x${side} (inner ${Math.round(INNER_RATIO * 100)}%)`)
}

build().catch(e => { console.error(e); process.exit(1) })
