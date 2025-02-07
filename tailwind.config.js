const { fontFamily } = require('tailwindcss/defaultTheme');

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      backgroundImage: {
        community: "url('/assets/img/community_redentor_camp.jpeg')",
      },
      maxWidth: {
        '8xl': '90rem',
      },
      letterSpacing: {
        snug: '-0.011em',
      },
      fontSize: {
        '2xs': '0.625rem',
        '3xl': '1.75rem',
        '4xl': '2.5rem',
      },
      lineHeight: {
        tighter: 1.1,
      },
      fontFamily: {
        sans: ['var(--font-nunito-sans)', ...fontFamily.sans],
      },
      keyframes: {
        highlight: {
          from: { 'background-size': '0% 100%' },
          to: { 'background-size': '100% 100%' },
        },
      },
      animation: {
        highlight: 'highlight 1s ease-in-out forwards',
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
