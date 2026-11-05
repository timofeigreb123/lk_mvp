/** Палитра ННГАСУ — см. PLAN.md, раздел «Дизайн». */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: '#FF7A3D', hover: '#F0662A', soft: '#FFF1EA' },
        ink: '#1A1A1A',
        muted: '#6B7280',
        bg: '#F4F4F5',
        line: '#E5E7EB',
      },
      fontFamily: { sans: ['Inter', 'system-ui', 'Segoe UI', 'Roboto', 'sans-serif'] },
    },
  },
};
