import aspectRatio from '@tailwindcss/aspect-ratio';
import containerQueries from '@tailwindcss/container-queries';
import forms from '@tailwindcss/forms';
import typography from '@tailwindcss/typography';

export default {
  content: ['./src/components/**/*.html', './src/content/**/*.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Atkinson Hyperlegible', 'system-ui', 'sans-serif'],
        mono: ['Berkeley Mono', 'monospace'],
      },
      colors: {
        mondrian_black: '#272A31',
        mondrian_white: '#E7E4E1',
        mondrian_red: '#B82116',
        mondrian_yellow: '#E0B705',
        mondrian_blue: '#3D51BA',
      },
      boxShadow: {
        mondrian: '2px 2px theme(colors.mondrian_black)',
        mondrian_xl: '4px 4px theme(colors.mondrian_black)',
        mondrian_inverse: '-2px -2px theme(colors.mondrian_black)',
        mondrian_inverse_xl: '-4px -4px theme(colors.mondrian_black)',
      },
    },
  },
  plugins: [typography, forms, containerQueries, aspectRatio],
};
