import { defineConfig } from 'vite';
import dts from 'vite-plugin-dts';
import path from 'path';

export default defineConfig({
  build: {
    lib: {
        entry: path.resolve(__dirname, 'src/index.ts'),
        formats: ['es', 'cjs'],
        fileName: (format) => format === 'cjs' ? `index.cjs` : `index.mjs`,
    },
    rollupOptions: {
      external: [], // 외부 종속성을 설정 (필요에 따라 추가)
      output: {
        globals: {}, // 글로벌 변수 설정 (필요에 따라 추가)
      },
    },
  },
  plugins: [
    dts({
      insertTypesEntry: true, // `types` 필드를 생성하고 `package.json`에 추가합니다.
      outputDir: 'dist', // 타입 정의 파일을 생성할 디렉토리
    }),
  ],
});
