import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import copy from 'rollup-plugin-copy';

const production = !process.env.ROLLUP_WATCH;

export default [
  // Content Script
  {
    input: 'src/content/index.ts',
    output: {
      file: 'dist/content.js',
      format: 'iife',
      name: 'BabelTower',
      sourcemap: !production
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      production && terser()
    ]
  },
  // Background Service Worker
  {
    input: 'src/background/index.ts',
    output: {
      file: 'dist/background.js',
      format: 'es',
      sourcemap: !production
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      production && terser()
    ]
  },
  // Options Page
  {
    input: 'src/options/index.ts',
    output: {
      file: 'dist/options.js',
      format: 'iife',
      name: 'BabelTowerOptions',
      sourcemap: !production
    },
    plugins: [
      resolve({ browser: true }),
      commonjs(),
      typescript({ tsconfig: './tsconfig.json' }),
      production && terser(),
      copy({
        targets: [
          { src: 'public/*', dest: 'dist' },
          { src: 'public/_locales', dest: 'dist' },
          { src: 'src/options/options.html', dest: 'dist' },
          { src: 'src/content/styles.css', dest: 'dist' }
        ]
      })
    ]
  }
];
