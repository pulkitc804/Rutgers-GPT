/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./sidepanel.html",
    "./src/**/*.{ts,tsx}",
    "../../packages/shared/src/**/*.{ts,tsx}",
  ],
  theme: { extend: {} },
  plugins: [],
};
