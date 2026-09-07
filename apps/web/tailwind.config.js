/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f1419",
        paper: "#f3efe6",
        steel: "#2c4a6e",
        accent: "#b45309",
      },
      fontFamily: {
        display: ["\"Source Serif 4\"", "Georgia", "serif"],
        sans: ["\"IBM Plex Sans\"", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};
