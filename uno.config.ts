import {
  defineConfig,
  presetIcons,
  presetWebFonts,
  presetWind4,
} from 'unocss'

export default defineConfig({
  presets: [
    presetWind4(),
    presetIcons({
      scale: 1.2,
      warn: true,
    }),
    presetWebFonts({
      fonts: {
        sans: 'Roboto',
        serif: 'Roboto Serif',
        mono: 'Roboto Mono',
      },
    }),
  ],
})
